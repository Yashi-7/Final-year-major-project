"""
Crop recommendation inference service.

Loads the artifact produced by training/train_crop_recommendation.py and turns
validated farmer inputs into a ranked list of crop names.

Nothing here is hardcoded: every recommended crop comes from the trained model.
Probabilities are used internally for ranking only and are never returned.
"""

import json
import logging
import math
import warnings
from pathlib import Path

import joblib
import numpy as np

log = logging.getLogger("crop_recommendation")

PACKAGE_DIR = Path(__file__).resolve().parent
DEFAULT_MODEL_DIR = PACKAGE_DIR.parent / "models" / "crop_recommendation"


class ValidationError(Exception):
    """Raised when the request payload does not satisfy the input contract."""

    def __init__(self, errors):
        super().__init__("Validation failed")
        self.errors = errors  # list of {"field": str, "message": str}


class ModelUnavailableError(Exception):
    """Raised when the model artifact is missing, unreadable or incompatible."""


def load_schema():
    return json.loads((PACKAGE_DIR / "schema.json").read_text(encoding="utf-8"))


class CropRecommender:
    def __init__(self, model_dir=None, schema=None):
        self.model_dir = Path(model_dir) if model_dir else DEFAULT_MODEL_DIR
        self.schema = schema or load_schema()
        self.model = None
        self.metadata = None
        self.load_error = None
        self._load()

    # ------------------------------------------------------------------ loading
    def _load(self):
        try:
            model_path = self.model_dir / "model.joblib"
            meta_path = self.model_dir / "metadata.json"
            if not model_path.is_file() or not meta_path.is_file():
                raise FileNotFoundError(
                    "Model artifact not found. Run: python training/train_crop_recommendation.py"
                )
            metadata = json.loads(meta_path.read_text(encoding="utf-8"))

            expected = [f["name"] for f in self.schema["numericFields"]] + [
                f"season:{s}" for s in self.schema["seasons"]
            ]
            if metadata.get("featureOrder") != expected:
                raise ValueError("Model feature order does not match schema.json; retrain the model.")

            with warnings.catch_warnings(record=True) as caught:
                warnings.simplefilter("always")
                # NOTE: joblib/pickle executes code on load. Only load artifacts you trained yourself.
                model = joblib.load(model_path)
            for w in caught:
                if "version" in str(w.message).lower():
                    raise ValueError(
                        "Model was trained with a different scikit-learn version; retrain the model."
                    )

            known = {c["name"]: c["slug"] for c in metadata["crops"]}
            if set(model.classes_) != set(known):
                raise ValueError("Model classes do not match metadata; retrain the model.")

            self.model, self.metadata, self._slugs = model, metadata, known
            self.load_error = None
            log.info("Crop model loaded: %d crops", len(known))
        except Exception as exc:  # noqa: BLE001 - reported via /ready, never crashes the service
            self.model, self.metadata, self.load_error = None, None, str(exc)
            log.error("Crop model unavailable: %s", exc)

    @property
    def ready(self):
        return self.model is not None

    # --------------------------------------------------------------- validation
    def validate(self, payload):
        """Strict whitelist validation. Returns a clean dict of floats + season."""
        if not isinstance(payload, dict):
            raise ValidationError([{"field": "body", "message": "Request body must be a JSON object."}])

        errors, clean = [], {}
        allowed = {f["name"] for f in self.schema["numericFields"]} | {"season"}
        for extra in sorted(set(payload) - allowed):
            errors.append({"field": extra, "message": "Unknown field."})

        for f in self.schema["numericFields"]:
            name, raw = f["name"], payload.get(f["name"])
            if raw is None or (isinstance(raw, str) and not raw.strip()):
                errors.append({"field": name, "message": "This field is required."})
                continue
            if isinstance(raw, bool):
                errors.append({"field": name, "message": "Must be a number."})
                continue
            try:
                value = float(raw)
            except (TypeError, ValueError):
                errors.append({"field": name, "message": "Must be a number."})
                continue
            if not math.isfinite(value):
                errors.append({"field": name, "message": "Must be a finite number."})
            elif not f["min"] <= value <= f["max"]:
                errors.append({"field": name, "message": f"Must be between {f['min']} and {f['max']}."})
            else:
                clean[name] = value

        season = payload.get("season")
        if season is None or (isinstance(season, str) and not season.strip()):
            errors.append({"field": "season", "message": "This field is required."})
        elif not isinstance(season, str) or season not in self.schema["seasons"]:
            errors.append(
                {"field": "season", "message": f"Must be one of: {', '.join(self.schema['seasons'])}."}
            )
        else:
            clean["season"] = season

        if errors:
            raise ValidationError(errors)
        return clean

    # --------------------------------------------------------------- prediction
    def out_of_range_notice(self, clean):
        """A plain-language caution when inputs fall outside what the model learned from."""
        ranges = (self.metadata or {}).get("trainingRanges", {})
        outside = [n for n, (lo, hi) in ranges.items() if n in clean and not lo <= clean[n] <= hi]
        if not outside:
            return None
        return (
            "Some of your values are outside the range this model was built from, "
            "so treat these suggestions with extra care."
        )
 
    def recommend(self, payload):
        """Return ranked crop predictions and log model inputs for debugging."""
        clean = self.validate(payload)

        if not self.ready:
            raise ModelUnavailableError(
                 self.load_error or "Model is not loaded."
        )

        numeric = [
            clean[field["name"]]
            for field in self.schema["numericFields"]
    ]

        season_values = [
            1.0 if clean["season"] == season else 0.0
            for season in self.schema["seasons"]
    ]

        x = np.array(
            [numeric + season_values],
            dtype=np.float32
    )

        probabilities = self.model.predict_proba(x)[0]

        top_n = min(
            int(self.schema.get("topN", 5)),
            len(self.model.classes_)
    )

        indices = np.argsort(-probabilities)[:top_n]

    # Diagnostic logs appear in the Flask terminal.
        feature_names = [
            field["name"]
            for field in self.schema["numericFields"]
    ] + [
            f"season:{season}"
            for season in self.schema["seasons"]
    ]

        log.info(
            "Crop prediction inputs: %s",
            dict(zip(feature_names, x[0].tolist()))
    )

        log.info(
            "Top crop predictions: %s",
        [
            (
                str(self.model.classes_[i]),
                round(float(probabilities[i]), 4)
            )
            for i in indices
        ]
    )

        recommendations = [
        {
            "rank": rank,
            "crop": str(self.model.classes_[index]),
            "slug": self._slugs[str(self.model.classes_[index])]
        }
          for rank, index in enumerate(indices, start=1)
    ]

        return recommendations, self.out_of_range_notice(clean)