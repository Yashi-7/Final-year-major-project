"""
Build backend/data/agriculture-insights.json from the district agriculture dataset.

    python scripts/build_agriculture_insights.py --data path/to/district_agriculture_ml_ready.csv

What it computes (reference data, NOT live claim data and NOT official statistics):
  for every state and district: the top crops by share of recorded cropped area, and the share of area by season,
  over the latest five complete years in the file (2015-2019; 2020 is partial).

Notes
  * Only percentages are stored. The dataset does not state an area unit, so no absolute areas are shown.
  * Aggregate / catch-all rows ("Total foodgrain", "Other Vegetables", ...) are removed.
  * Different names for the same crop are merged (Paddy=Rice, Kapas=Cotton(lint), ...); when both names occur for the
    same district/season/year the LARGER area is used, so the same field is not counted twice.
  * `area` is stable across years in this file (unlike `yield`, which changes scale around 2015).
Requires pandas.
"""
import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
YEARS = (2015, 2019)
AGGREGATES = {"Total foodgrain", "Oilseeds total", "Pulses total", "Cond-spcs other", "Jute & mesta", "Citrus Fruit", "Pome Fruit",
              "Cashewnut Raw", "Cashewnut Processed", "Arcanut (Processed)", "Atcanut (Raw)"}
RENAME = {
    "Paddy": "Rice", "Kapas": "Cotton", "Cotton(lint)": "Cotton", "Dry ginger": "Ginger", "Blackgram": "Urad (Black Gram)",
    "Urad": "Urad (Black Gram)", "Moong(Green Gram)": "Moong (Green Gram)", "Arhar/Tur": "Arhar / Tur (Pigeon Pea)",
    "Rapeseed &Mustard": "Rapeseed & Mustard", "Soyabean": "Soybean", "Sannhamp": "Sunn Hemp", "Cowpea(Lobia)": "Cowpea (Lobia)",
    "Castor seed": "Castor Seed", "Niger seed": "Niger Seed", "Guar seed": "Guar Seed", "Sweet potato": "Sweet Potato",
    "Small millets": "Small Millets", "Horse-gram": "Horse Gram", "Black pepper": "Black Pepper", "Dry chillies": "Dry Chillies",
    "Cashewnut": "Cashew Nut", "Peas & beans (Pulses)": "Peas & Beans (Pulses)",
}


def shares(frame: pd.DataFrame, column: str, top: int | None):
    total = frame["area"].sum()
    if total <= 0:
        return []
    s = frame.groupby(column)["area"].sum().sort_values(ascending=False)
    if top:
        s = s.head(top)
    return [{"name": str(k), "sharePercent": round(float(v) / float(total) * 100, 1)} for k, v in s.items()]


def summarise(frame: pd.DataFrame):
    return {"topCrops": shares(frame, "crop", 5), "seasons": shares(frame, "season", None)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", default=str(ROOT / "backend" / "data" / "agriculture-insights.json"))
    args = ap.parse_args()

    df = pd.read_csv(args.data, usecols=["state", "district", "season", "crop", "year", "area"])
    df = df[df["year"].between(*YEARS) & (df["area"] > 0)].copy()
    df["crop"] = df["crop"].map(lambda c: re.sub(r"\s+", " ", str(c)).strip())
    df = df[~df["crop"].isin(AGGREGATES) & ~df["crop"].str.lower().str.startswith(("other", "total"))]
    df["crop"] = df["crop"].replace(RENAME)
    df["state"] = df["state"].str.strip()
    df["district"] = df["district"].str.strip()
    df = df.groupby(["state", "district", "season", "year", "crop"], as_index=False)["area"].max()

    states = {}
    for state, sdf in df.groupby("state"):
        entry = summarise(sdf)
        entry["districts"] = {district: summarise(ddf) for district, ddf in sdf.groupby("district")}
        states[state] = entry

    out = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sourceDataset": Path(args.data).name,
        "yearRange": list(YEARS),
        "method": "Share of recorded cropped area (sum of area over the years shown). Aggregate and catch-all rows removed; "
                  "duplicate crop names merged using the larger area. The dataset states no area unit, so only percentages are given.",
        "states": states,
    }
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {args.out}: {len(states)} states, {sum(len(v['districts']) for v in states.values())} districts")


if __name__ == "__main__":
    main()
