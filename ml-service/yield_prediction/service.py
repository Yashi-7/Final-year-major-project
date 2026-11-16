"""
Yield prediction inference service.

Loads the artifacts written by training/train_yield_prediction.py (model.joblib + metadata.json)
and turns validated farmer input into a predicted yield value.

Inputs are exactly: state, season, crop, year. Area and production are never inputs.
Nothing is hardcoded: every number returned is produced by the trained model.
"""

import json
import logging
import math
import os
import warnings
from pathlib import Path

import joblib
import numpy as np

from .encoding import FEATURE_ORDER, encode_row, normalize_crop

log = logging.getLogger("yield_prediction")

PACKAGE_DIR = Path(__file__).resolve().parent
DEFAULT_MODEL_DIR = PACKAGE_DIR.parent / "models" / "yield_prediction"


class ValidationError(Exception):
    def __init__(self, errors):
        super().__init__("Validation failed")
        self.errors = errors  # [{"field", "message"}]


class ModelUnavailableError(Exception):
    """Model artifacts missing, unreadable, or inconsistent."""


def load_schema():
    return json.loads((PACKAGE_DIR / "schema.json").read_text(encoding="utf-8"))


def _is_blank(value):
    return value is None or (isinstance(value, str) and not value.strip())


class YieldPredictor:
    def __init__(self, model_dir=None, schema=None):
        # YIELD_MODEL_DIR lets a deployment keep artifacts elsewhere (and lets tests simulate missing files).
        self.model_dir = Path(model_dir or os.environ.get("YIELD_MODEL_DIR") or DEFAULT_MODEL_DIR)
        self.schema = schema or load_schema()
        self.model = None
        self.metadata = None
        self.load_error = None
        self._load()

    # ------------------------------------------------------------------ loading
    def _load(self):
        try:
            model_path, meta_path = self.model_dir / "model.joblib", self.model_dir / "metadata.json"
            if not model_path.is_file() or not meta_path.is_file():
                raise FileNotFoundError(
                    "Yield model artifacts not found. Run: python training/train_yield_prediction.py"
                )
            meta = json.loads(meta_path.read_text(encoding="utf-8"))

            if meta.get("featureOrder") != list(FEATURE_ORDER):
                raise ValueError("Model features do not match the expected [state, season, crop, year].")
            if {"area", "production"} & set(meta.get("featureOrder", [])):
                raise ValueError("Model uses area/production, which would leak the target.")
            for key in ("categories", "validCombinations", "cropLabels", "cropSlugs", "yearsInTrainingData"):
                if key not in meta:
                    raise ValueError(f"metadata.json is missing '{key}'.")

            with warnings.catch_warnings(record=True) as caught:
                warnings.simplefilter("always")
                # NOTE: joblib/pickle executes code on load. Only load artifacts you trained yourself.
                model = joblib.load(model_path)
            if any("version" in str(w.message).lower() for w in caught):
                raise ValueError("Model was trained with a different scikit-learn version; retrain it.")
            if getattr(model, "n_features_in_", None) != len(FEATURE_ORDER):
                raise ValueError("Model does not take exactly 4 features; retrain it.")

            self.model, self.metadata, self.load_error = model, meta, None
            log.info("Yield model loaded")
        except Exception as exc:  # noqa: BLE001 - surfaced via /ready, never crashes the service
            self.model, self.metadata, self.load_error = None, None, str(exc)
            log.error("Yield model unavailable: %s", exc)

    @property
    def ready(self):
        return self.model is not None

    # ------------------------------------------------------------------ options
    def options(self):
        """Everything the form needs, straight from the model's own metadata."""
        if not self.ready:
            raise ModelUnavailableError(self.load_error or "Model is not loaded.")
        meta, y = self.metadata, self.schema["year"]
        combos = meta["validCombinations"]
        return {
            "years": {
                "min": y["min"], "max": y["max"],
                "trainedMin": meta["yearsInTrainingData"]["min"], "trainedMax": meta["yearsInTrainingData"]["max"],
                "scaleBreakYear": (meta.get("scaleBreak") or {}).get("aroundYear"),
            },
            "states": sorted(combos),
            "seasonsByState": {s: sorted(seasons) for s, seasons in combos.items()},
            "cropsByStateSeason": combos,
            "cropLabels": meta["cropLabels"],
        }

    # --------------------------------------------------------------- validation
    def validate(self, payload):
        """Strict whitelist validation incl. category membership. Returns a clean dict."""
        if not isinstance(payload, dict):
            raise ValidationError([{"field": "body", "message": "Request body must be a JSON object."}])
        errors, clean = [], {}
        allowed = set(self.schema["features"])
        for extra in sorted(set(payload) - allowed):
            errors.append({"field": extra, "message": "Unknown field."})

        max_len = self.schema["maxTextLength"]
        for name in ("state", "season", "crop"):
            raw = payload.get(name)
            if _is_blank(raw):
                errors.append({"field": name, "message": f"{name.capitalize()} is required."})
            elif not isinstance(raw, str):
                errors.append({"field": name, "message": f"{name.capitalize()} must be text."})
            elif len(raw) > max_len:
                errors.append({"field": name, "message": f"{name.capitalize()} is too long."})
            else:
                clean[name] = normalize_crop(raw) if name == "crop" else raw.strip()

        y = self.schema["year"]
        raw_year = payload.get("year")
        if _is_blank(raw_year):
            errors.append({"field": "year", "message": "Year is required."})
        elif isinstance(raw_year, bool) or not isinstance(raw_year, (int, float, str)):
            errors.append({"field": "year", "message": "Year must be a whole number."})
        else:
            try:
                number = float(raw_year)
                if not math.isfinite(number) or number != int(number):
                    raise ValueError
                if isinstance(raw_year, str) and not raw_year.strip().lstrip("-").isdigit():
                    raise ValueError
            except (ValueError, OverflowError):
                errors.append({"field": "year", "message": "Year must be a whole number."})
            else:
                year = int(number)
                if not y["min"] <= year <= y["max"]:
                    errors.append({"field": "year", "message": f"Year must be between {y['min']} and {y['max']}."})
                else:
                    clean["year"] = year

        if errors:
            raise ValidationError(errors)

        # Category membership needs the model metadata, so it needs the model to be loaded.
        if not self.ready:
            raise ModelUnavailableError(self.load_error or "Model is not loaded.")
        combos = self.metadata["validCombinations"]
        if clean["state"] not in combos:
            errors.append({"field": "state", "message": "This state is not supported by the model."})
        elif clean["season"] not in combos[clean["state"]]:
            errors.append({"field": "season", "message": "No data for this season in the selected state."})
        elif clean["crop"] not in combos[clean["state"]][clean["season"]]:
            errors.append({"field": "crop", "message": "No data for this crop in the selected state and season."})
        if errors:
            raise ValidationError(errors)
        return clean

    # --------------------------------------------------------------- prediction
    def predict(self, payload):
        """Returns (result_dict, notice). `notice` is None or a short caution string."""
        clean = self.validate(payload)
        row = encode_row(self.metadata["categories"], clean["state"], clean["season"], clean["crop"], clean["year"])
        value = float(self.model.predict(np.array([row], dtype=np.float32))[0])
        if not math.isfinite(value):
            raise ModelUnavailableError("Model produced a non-finite value.")

        trained = self.metadata["yearsInTrainingData"]
        notice = None
        if clean["year"] > trained["max"]:
            notice = (
                f"The model learned from data up to {trained['max']}. For {clean['year']} it does not project "
                f"future trends; the estimate reflects the years it has seen."
            )
        result = {
            "prediction": {"value": round(value, 2)},
            "dataNote": self.metadata.get("dataNote"),
            "inputs": {**clean, "cropLabel": self.metadata["cropLabels"][clean["crop"]],
                       "cropSlug": self.metadata["cropSlugs"][clean["crop"]]},
        }
        return result, notice
