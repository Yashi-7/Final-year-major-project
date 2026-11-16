"""
Train the yield-prediction model from the district agriculture dataset.

    python training/train_yield_prediction.py --data data/district_agriculture_ml_ready.csv

Model: RandomForestRegressor(n_estimators=150, max_depth=16, random_state=42)
Features: state, season, crop, year  (nothing else).

Leakage guard: in this dataset yield == production / area for every row, so `production`
and `area` are never read. Only the five columns state, season, crop, year, yield are loaded.

Data preparation
  * crop names: whitespace collapsed (otherwise exactly as in the dataset)
  * aggregate rows ("Total foodgrain", "Oilseeds total", "Pulses total") removed
  * rows with yield == 0 removed (production recorded as 0: treated as unreported, not a real yield)
  * only state/season/crop combinations with >= MIN_ROWS_PER_COMBO rows are offered to users

Unit: the dataset does not state one and its scale differs by crop, so none is recorded.

Outputs (models/yield_prediction/)
  model.joblib   - the fitted RandomForestRegressor (numpy features)
  metadata.json  - categories (the encoders), valid combinations, year range, training info,
                   and hold-out metrics computed here (nothing is copied from elsewhere)

Requires: pip install -r requirements-training.txt
"""

import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path
import sys

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from yield_prediction.encoding import (  # noqa: E402
    CATEGORICAL, FEATURE_ORDER, crop_label, encode_frame_columns, normalize_crop, slugify,
)

SCHEMA = json.loads((ROOT / "yield_prediction" / "schema.json").read_text(encoding="utf-8"))
assert tuple(SCHEMA["features"]) == FEATURE_ORDER
OUT_DIR = ROOT / "models" / "yield_prediction"

USECOLS = ["state", "season", "crop", "year", "yield"]   # NOTE: no area, no production
assert not {"area", "production"} & set(USECOLS)

AGGREGATES = {"Total foodgrain", "Oilseeds total", "Pulses total"}
MIN_ROWS_PER_COMBO = 5
RANDOM_STATE = 42
HYPERPARAMS = dict(n_estimators=150, max_depth=16, random_state=RANDOM_STATE)


def load_and_clean(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, usecols=USECOLS)
    n0 = len(df)
    df["crop"] = df["crop"].map(normalize_crop)
    df["state"] = df["state"].astype(str).str.strip()
    df["season"] = df["season"].astype(str).str.strip()
    df = df[~df["crop"].isin(AGGREGATES)]
    df = df.dropna(subset=USECOLS)
    df = df[df["yield"] > 0]
    df["year"] = df["year"].astype(int)
    size = df.groupby(["state", "season", "crop"])["crop"].transform("size")
    df = df[size >= MIN_ROWS_PER_COMBO].reset_index(drop=True)
    print(f"Rows: {n0} raw -> {len(df)} after cleaning; "
          f"{df['state'].nunique()} states, {df['season'].nunique()} seasons, {df['crop'].nunique()} crops")
    return df


def detect_scale_break(df: pd.DataFrame) -> dict:
    """
    Measures a change of scale in the source `yield` column around 2015 (see README).
    Compares each major crop's median yield in 2010-2014 with 2016-2019.
    """
    big = df.groupby("crop").size()
    big = big[big >= 500].index
    pre = df[df["year"].between(2010, 2014) & df["crop"].isin(big)].groupby("crop")["yield"].median()
    post = df[df["year"].between(2016, 2019) & df["crop"].isin(big)].groupby("crop")["yield"].median()
    ratio = (post / pre).replace([np.inf, -np.inf], np.nan).dropna()
    k, n = int((ratio > 20).sum()), int(len(ratio))
    note = (
        f"In the source data, recorded yield values are on a much larger scale from 2015 onward "
        f"(for {k} of {n} major crops the typical value is more than 20 times higher than in 2010-2014). "
        f"The dataset gives no unit, so none is shown, and predictions for years before and from 2015 "
        f"are not comparable with each other."
    )
    return {
        "aroundYear": 2015,
        "majorCropsCompared": n,
        "cropsWithMoreThan20xIncrease": k,
        "medianYieldUpTo2014": round(float(df.loc[df["year"] <= 2014, "yield"].median()), 3),
        "medianYieldFrom2015": round(float(df.loc[df["year"] >= 2015, "yield"].median()), 3),
        "note": note,
    }


def make_model() -> RandomForestRegressor:
    return RandomForestRegressor(n_jobs=-1, **HYPERPARAMS)


def metrics(y_true, y_pred) -> dict:
    return {
        "r2": round(float(r2_score(y_true, y_pred)), 4),
        "mae": round(float(mean_absolute_error(y_true, y_pred)), 2),
        "rmse": round(float(np.sqrt(mean_squared_error(y_true, y_pred))), 2),
        "test_rows": int(len(y_true)),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default=str(ROOT / "data" / "district_agriculture_ml_ready.csv"))
    args = parser.parse_args()

    df = load_and_clean(Path(args.data))
    categories = {k: sorted(df[k].unique().tolist()) for k in CATEGORICAL}
    X = encode_frame_columns(categories, df["state"], df["season"], df["crop"], df["year"])
    y = df["yield"].to_numpy(dtype=np.float64)

    # 1) Random 80/20 split (the usual convention).
    t0 = time.time()
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=RANDOM_STATE)
    m1 = make_model().fit(Xtr, ytr)
    random_split = metrics(yte, m1.predict(Xte))
    print("Random 80/20 split:", random_split, f"({time.time() - t0:.0f}s)")
    del m1

    # 2) Stricter check: train on years <= 2016, test on 2017-2020 (unseen years).
    t0 = time.time()
    train_mask = df["year"].to_numpy() <= 2016
    m2 = make_model().fit(X[train_mask], y[train_mask])
    temporal = metrics(y[~train_mask], m2.predict(X[~train_mask]))
    print("Train <=2016 / test 2017-2020:", temporal, f"({time.time() - t0:.0f}s)")
    del m2

    scale_break = detect_scale_break(df)
    print("Scale break:", json.dumps({k: v for k, v in scale_break.items() if k != "note"}))

    final = make_model().fit(X, y)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(final, OUT_DIR / "model.joblib", compress=3)

    combos = (
        df.groupby(["state", "season", "crop"]).size().reset_index(name="rows")
    )
    valid = {}
    for state, g in combos.groupby("state"):
        valid[state] = {season: sorted(gs["crop"].tolist()) for season, gs in g.groupby("season")}

    metadata = {
        "modelType": "RandomForestRegressor",
        "hyperparameters": HYPERPARAMS,
        "trainedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sklearnVersion": sklearn.__version__,
        "numpyVersion": np.__version__,
        "featureOrder": list(FEATURE_ORDER),
        "excludedColumns": ["area", "production"],
        "excludedReason": "yield = production / area; using either would leak the target.",
        "target": "yield (production / area, as recorded in the dataset)",
        "unit": None,
        "unitNote": "The dataset does not state a unit and the scale differs by crop.",
        "categories": categories,                       # ordered lists = the encoders
        "validCombinations": valid,                     # state -> season -> [crops]
        "cropLabels": {c: crop_label(c) for c in categories["crop"]},
        "cropSlugs": {c: slugify(crop_label(c)) for c in categories["crop"]},
        "yearsInTrainingData": {"min": int(df["year"].min()), "max": int(df["year"].max())},
        "minRowsPerCombination": MIN_ROWS_PER_COMBO,
        "scaleBreak": scale_break,
        "dataNote": scale_break["note"],
        "trainingRows": int(len(df)),
        "sourceDataset": Path(args.data).name,
        "holdoutMetrics": {"randomSplit80_20": random_split, "temporalTrainUpTo2016TestFrom2017": temporal},
        "metricsNote": "Computed by this training script on this dataset. Yield values span several orders of magnitude "
                       "(e.g. coconut) and change scale around 2015 (see scaleBreak), so RMSE and R2 are dominated by large-valued "
                       "rows and by the year effect; they should not be read as agronomic accuracy.",
    }
    (OUT_DIR / "metadata.json").write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Saved model.joblib ({(OUT_DIR / 'model.joblib').stat().st_size / 1e6:.1f} MB) + metadata.json "
          f"({sum(len(v) for st in valid.values() for v in st.values())} state/season/crop combos in {len(valid)} states)")


if __name__ == "__main__":
    main()
