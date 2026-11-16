"""
Feature encoding shared by training and inference, so both always agree.

Categories are stored in metadata.json as ordered lists; a value's code is its index
in that list. There is no pandas dependency at inference time.
"""

import re

import numpy as np

CATEGORICAL = ("state", "season", "crop")
FEATURE_ORDER = ("state", "season", "crop", "year")


def normalize_crop(name: str) -> str:
    """Trim and collapse whitespace only. Crop names are otherwise kept exactly as in the dataset."""
    return re.sub(r"\s+", " ", str(name)).strip()


def crop_label(name: str) -> str:
    """Display-only tidy-up ("Cotton(lint)" -> "Cotton (lint)", "Rapeseed &Mustard" -> "Rapeseed & Mustard")."""
    label = re.sub(r"\s*\(", " (", normalize_crop(name))
    label = re.sub(r"&(?=\S)", "& ", label)
    return re.sub(r"\s+", " ", label)


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def encode_row(categories: dict, state: str, season: str, crop: str, year: int) -> list:
    """One feature row in FEATURE_ORDER. Raises KeyError/ValueError for unknown categories."""
    return [
        float(categories["state"].index(state)),
        float(categories["season"].index(season)),
        float(categories["crop"].index(crop)),
        float(year),
    ]


def encode_frame_columns(categories: dict, states, seasons, crops, years) -> np.ndarray:
    """Vectorised encoding for training (arrays of raw values)."""
    maps = {k: {v: i for i, v in enumerate(categories[k])} for k in CATEGORICAL}
    return np.column_stack(
        [
            np.array([maps["state"][s] for s in states], dtype=np.float32),
            np.array([maps["season"][s] for s in seasons], dtype=np.float32),
            np.array([maps["crop"][c] for c in crops], dtype=np.float32),
            np.asarray(years, dtype=np.float32),
        ]
    )
