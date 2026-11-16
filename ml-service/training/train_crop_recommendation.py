"""
Train the crop-recommendation model from the district agriculture dataset.

    python training/train_crop_recommendation.py --data data/district_agriculture_ml_ready.csv

What the model learns
---------------------
Each dataset row is one crop cultivated in one district, in one season and year,
together with that district's soil (N, P, K, pH) and that year's climate
(temperature, rainfall, humidity). The classifier learns which crops are
typically cultivated under a given combination of soil, climate and season,
and the service returns the top-N crops for the conditions a farmer enters.

It is therefore a "crops commonly grown under similar conditions" model. It is
not an agronomic simulation and it does not use market prices or yields.

Outputs (written to models/crop_recommendation/)
  model.joblib   - the fitted RandomForestClassifier (numpy features only)
  metadata.json  - feature order, crop list, training info and hold-out metrics

Requires: pip install -r requirements-training.txt
"""

import argparse
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import GroupShuffleSplit

ROOT = Path(__file__).resolve().parent.parent
SCHEMA = json.loads((ROOT / "crop_recommendation" / "schema.json").read_text(encoding="utf-8"))
OUT_DIR = ROOT / "models" / "crop_recommendation"

NUMERIC_COLUMNS = [f["column"] for f in SCHEMA["numericFields"]]
SEASONS = SCHEMA["seasons"]

# Rows that are aggregates, processed forms or catch-all buckets. A farmer cannot
# "grow" these, so they are removed before training.
DROP_CROPS = {
    "Total foodgrain", "Oilseeds total", "Pulses total", "Cond-spcs other",
    "other oilseeds", "other fibres", "Other Cereals", "Other Cereals & Millets",
    "Other Fresh Fruits", "Other Vegetables", "Other Citrus Fruit", "Other Dry Fruit",
    "Other Kharif pulses", "Other Rabi pulses", "Other  Rabi pulses",
    "Other Summer Pulses", "other misc. pulses", "Jute & mesta", "Cashewnut Raw",
    "Cashewnut Processed", "Arcanut (Processed)", "Atcanut (Raw)", "Citrus Fruit",
    "Pome Fruit",
}

# Spelling / naming clean-up and merging of duplicate labels (same crop, two names).
RENAME_CROPS = {
    "Moong(Green Gram)": "Moong (Green Gram)",
    "Arhar/Tur": "Arhar / Tur (Pigeon Pea)",
    "Rapeseed &Mustard": "Rapeseed & Mustard",
    "Cotton(lint)": "Cotton", "Kapas": "Cotton",
    "Paddy": "Rice",
    "Blackgram": "Urad (Black Gram)", "Urad": "Urad (Black Gram)",
    "Soyabean": "Soybean",
    "Sannhamp": "Sunn Hemp",
    "Dry ginger": "Ginger",
    "Cowpea(Lobia)": "Cowpea (Lobia)",
    "Castor seed": "Castor Seed", "Niger seed": "Niger Seed", "Guar seed": "Guar Seed",
    "Sweet potato": "Sweet Potato", "Small millets": "Small Millets",
    "Horse-gram": "Horse Gram", "Black pepper": "Black Pepper",
    "Dry chillies": "Dry Chillies", "Cashewnut": "Cashew Nut",
    "Peas & beans (Pulses)": "Peas & Beans (Pulses)",
    "Bhindi": "Okra (Bhindi)", "Brinjal": "Brinjal (Eggplant)",
    "Drum Stick": "Drumstick", "Jack Fruit": "Jackfruit",
    "Water Melon": "Watermelon", "Pump Kin": "Pumpkin", "Snak Guard": "Snake Gourd",
    "Ribed Guard": "Ridge Gourd", "Redish": "Radish", "Pome Granet": "Pomegranate",
    "Beans & Mutter(Vegetable)": "Beans & Peas (Vegetable)",
}

MIN_ROWS_PER_CROP = 1000     # crops with less evidence are not recommended
RANDOM_STATE = 42


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def load_and_clean(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    needed = set(NUMERIC_COLUMNS) | {"state", "district", "season", "crop", "area"}
    missing = needed - set(df.columns)
    if missing:
        raise SystemExit(f"Dataset is missing required columns: {sorted(missing)}")

    n0 = len(df)
    df["crop"] = df["crop"].astype(str).str.strip()
    df = df[~df["crop"].isin(DROP_CROPS)]
    df["crop"] = df["crop"].replace(RENAME_CROPS)
    df = df[df["season"].isin(SEASONS)]
    df = df[df["area"] > 0]                      # the crop was actually cultivated
    df = df.dropna(subset=NUMERIC_COLUMNS)

    counts = df["crop"].value_counts()
    keep = counts[counts >= MIN_ROWS_PER_CROP].index
    df = df[df["crop"].isin(keep)].reset_index(drop=True)
    print(f"Rows: {n0} raw -> {len(df)} after cleaning; crops kept: {df['crop'].nunique()}")
    return df


def features(df: pd.DataFrame) -> np.ndarray:
    num = df[NUMERIC_COLUMNS].to_numpy(dtype=np.float32)
    season = np.stack([(df["season"] == s).to_numpy(dtype=np.float32) for s in SEASONS], axis=1)
    return np.hstack([num, season])


def evaluate(model, df: pd.DataFrame, test_districts: set) -> dict:
    """
    Recommendation quality on districts the model never saw.

    For every held-out (district, year, season) we take the model's top-N crops and
    check them against the crops actually cultivated there in that season.
      precision@N : share of the N recommended crops that were really grown
      hit@N       : share of conditions where at least one recommended crop was grown
    The same numbers are computed for a "popularity" baseline that ignores the
    inputs and always suggests the N most common crops of that season, so it is
    clear whether the model adds anything.
    """
    n = SCHEMA["topN"]
    key = ["state", "district", "year", "season"]
    in_test = (df["state"] + "|" + df["district"]).isin(test_districts)
    test, train = df[in_test], df[~in_test]

    conditions = test.drop_duplicates(key)
    grown = test.groupby(key)["crop"].apply(set)
    proba = model.predict_proba(features(conditions))
    model_top = model.classes_[np.argsort(-proba, axis=1)[:, :n]]
    popular = train.groupby("season")["crop"].apply(lambda s: list(s.value_counts().index[:n]))

    def score(picks_for_row):
        prec, hit = [], []
        for i, row in enumerate(conditions.itertuples(index=False)):
            actual = grown[(row.state, row.district, row.year, row.season)]
            matches = [c in actual for c in picks_for_row(i, row)]
            prec.append(np.mean(matches))
            hit.append(any(matches))
        return round(float(np.mean(prec)), 4), round(float(np.mean(hit)), 4)

    m_prec, m_hit = score(lambda i, row: model_top[i])
    b_prec, b_hit = score(lambda i, row: popular[row.season])
    return {
        f"precision_at_{n}": m_prec, f"hit_at_{n}": m_hit,
        f"baseline_precision_at_{n}": b_prec, f"baseline_hit_at_{n}": b_hit,
        "heldout_conditions": int(len(conditions)),
        "heldout_districts": int(len(test_districts)),
        "note": "Whole districts held out; baseline = most common crops of the season.",
    }


def make_model() -> RandomForestClassifier:
    return RandomForestClassifier(
        n_estimators=60,
        min_samples_leaf=25,       # smoother, smaller model; avoids memorising districts
        max_features="sqrt",
        n_jobs=-1,
        random_state=RANDOM_STATE,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default=str(ROOT / "data" / "district_agriculture_ml_ready.csv"))
    args = parser.parse_args()

    df = load_and_clean(Path(args.data))
    X, y = features(df), df["crop"].to_numpy()
    groups = (df["state"] + "|" + df["district"]).to_numpy()

    # Hold out whole districts so the score reflects unseen locations
    # (soil values are constant per district and would otherwise leak).
    splitter = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=RANDOM_STATE)
    tr, te = next(splitter.split(X, y, groups))
    t0 = time.time()
    eval_model = make_model().fit(X[tr], y[tr])
    metrics = evaluate(eval_model, df, set(groups[te]))
    print("Hold-out metrics:", json.dumps(metrics, indent=2), f"({time.time() - t0:.0f}s)")

    final = make_model().fit(X, y)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(final, OUT_DIR / "model.joblib", compress=3)

    metadata = {
        "modelType": "RandomForestClassifier",
        "trainedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sklearnVersion": sklearn.__version__,
        "numpyVersion": np.__version__,
        "featureOrder": [f["name"] for f in SCHEMA["numericFields"]] + [f"season:{s}" for s in SEASONS],
        "seasons": SEASONS,
        "crops": [{"name": c, "slug": slugify(c)} for c in sorted(final.classes_)],
        "trainingRows": int(len(df)),
        "topN": SCHEMA["topN"],
        "trainingRanges": {
            f["name"]: [round(float(df[f["column"]].min()), 3), round(float(df[f["column"]].max()), 3)]
            for f in SCHEMA["numericFields"]
        },
        "sourceDataset": Path(args.data).name,
        "holdoutMetrics": metrics,
    }
    (OUT_DIR / "metadata.json").write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")
    size_mb = (OUT_DIR / "model.joblib").stat().st_size / 1e6
    print(f"Saved model.joblib ({size_mb:.1f} MB) and metadata.json with {len(metadata['crops'])} crops.")


if __name__ == "__main__":
    main()
