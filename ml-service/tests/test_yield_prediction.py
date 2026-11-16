"""Flask yield-prediction tests. Run from ml-service/:  python -m unittest discover -s tests -v"""

import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import create_app  # noqa: E402
from yield_prediction.encoding import encode_row  # noqa: E402
from yield_prediction.service import YieldPredictor  # noqa: E402

PREDICTOR = YieldPredictor()
META = PREDICTOR.metadata
VALID = {"state": "Punjab", "season": "Rabi", "crop": "Wheat", "year": 2015}


def client(predictor=None):
    return create_app(yield_predictor=predictor or PREDICTOR).test_client()


def post(payload, c=None):
    return (c or client()).post("/yield-prediction/predict", json=payload)


class ArtifactTests(unittest.TestCase):
    def test_valid_sample_is_model_supported(self):
        self.assertIn("Wheat", META["validCombinations"]["Punjab"]["Rabi"])

    def test_area_and_production_are_not_model_inputs(self):
        self.assertEqual(META["featureOrder"], ["state", "season", "crop", "year"])
        self.assertEqual(PREDICTOR.model.n_features_in_, 4)
        self.assertEqual(META["excludedColumns"], ["area", "production"])
        self.assertIsNone(META["unit"])

    def test_hyperparameters_match_specification(self):
        m = PREDICTOR.model
        self.assertEqual((m.n_estimators, m.max_depth, m.random_state), (150, 16, 42))

    def test_training_script_never_loads_area_or_production(self):
        src = (Path(__file__).resolve().parent.parent / "training" / "train_yield_prediction.py").read_text()
        line = next(l for l in src.splitlines() if l.startswith("USECOLS")).split("#")[0]
        self.assertEqual(json.loads(line.split("=", 1)[1].strip().replace("'", '"')), ["state", "season", "crop", "year", "yield"])

    def test_scale_break_is_measured_and_documented_in_metadata(self):
        sb = META["scaleBreak"]
        self.assertEqual(sb["aroundYear"], 2015)
        self.assertGreater(sb["cropsWithMoreThan20xIncrease"], 0.5 * sb["majorCropsCompared"])
        self.assertGreater(sb["medianYieldFrom2015"], 10 * sb["medianYieldUpTo2014"])
        self.assertEqual(META["dataNote"], sb["note"])

    def test_metrics_in_metadata_are_present_and_plausible(self):
        for split in META["holdoutMetrics"].values():
            self.assertTrue(0 < split["r2"] < 1 and split["mae"] > 0 and split["rmse"] >= split["mae"])


class HealthAndOptionsTests(unittest.TestCase):
    def test_ready(self):
        self.assertEqual(client().get("/yield-prediction/ready").get_json()["status"], "ready")

    def test_options_come_from_model_metadata(self):
        data = client().get("/yield-prediction/options").get_json()["data"]
        self.assertEqual(data["years"], {"min": 1997, "max": 2030, "trainedMin": 1997, "trainedMax": 2020, "scaleBreakYear": 2015})
        self.assertEqual(data["states"], sorted(META["validCombinations"]))
        self.assertIn("Rabi", data["seasonsByState"]["Punjab"])
        self.assertIn("Wheat", data["cropsByStateSeason"]["Punjab"]["Rabi"])
        for crops in (c for s in data["cropsByStateSeason"].values() for c in s.values()):
            for crop in crops:
                self.assertIn(crop, data["cropLabels"])


class SuccessTests(unittest.TestCase):
    def test_prediction_shape(self):
        res = post(VALID)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()["data"]
        self.assertTrue(res.get_json()["success"])
        self.assertIsInstance(data["prediction"]["value"], float)
        self.assertGreater(data["prediction"]["value"], 0)
        self.assertEqual({k: data["inputs"][k] for k in VALID}, VALID)
        self.assertEqual(data["inputs"]["cropSlug"], "wheat")
        self.assertIsNone(data["notice"])
        self.assertEqual(data["dataNote"], META["dataNote"])
        self.assertNotIn("area", json.dumps(data).lower())

    def test_value_equals_direct_model_inference(self):
        row = encode_row(META["categories"], "Punjab", "Rabi", "Wheat", 2015)
        expected = round(float(PREDICTOR.model.predict(np.array([row], dtype=np.float32))[0]), 2)
        self.assertEqual(post(VALID).get_json()["data"]["prediction"]["value"], expected)

    def test_output_depends_on_inputs(self):
        crops = META["validCombinations"]["Punjab"]["Rabi"]
        values = {post({**VALID, "crop": c}).get_json()["data"]["prediction"]["value"] for c in crops[:8]}
        self.assertGreater(len(values), 3)

    def test_year_as_string_accepted_and_deterministic(self):
        a = post({**VALID, "year": "2015"}).get_json()
        b = post(VALID).get_json()
        self.assertEqual(a["data"]["prediction"], b["data"]["prediction"])

    def test_year_after_training_data_adds_notice(self):
        for year, has in [(2020, False), (2021, True), (2030, True)]:
            notice = post({**VALID, "year": year}).get_json()["data"]["notice"]
            self.assertEqual(notice is not None, has, year)

    def test_boundary_years(self):
        self.assertEqual(post({**VALID, "year": 1997}).status_code, 200)
        self.assertEqual(post({**VALID, "year": 2030}).status_code, 200)

    def test_every_offered_combination_predicts(self):
        c = client()
        for state, seasons in list(META["validCombinations"].items())[:6]:
            for season, crops in seasons.items():
                for crop in crops[:2]:
                    r = c.post("/yield-prediction/predict", json={"state": state, "season": season, "crop": crop, "year": 2012})
                    self.assertEqual(r.status_code, 200, (state, season, crop))


class InvalidInputTests(unittest.TestCase):
    def fields(self, res):
        return {e["field"] for e in res.get_json()["errors"]}

    def test_missing_fields(self):
        res = post({})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.get_json()["code"], "VALIDATION_ERROR")
        self.assertEqual(self.fields(res), set(VALID))

    def test_area_and_production_are_rejected_as_unknown_fields(self):
        res = post({**VALID, "area": 100, "production": 5000})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(self.fields(res), {"area", "production"})

    def test_bad_years(self):
        for bad in [1996, 2031, 0, -5, 2015.5, "abc", "2015.5", "20e2", True, [], {}, "", None]:
            with self.subTest(year=bad):
                res = post({**VALID, "year": bad})
                self.assertEqual(res.status_code, 400)
                self.assertEqual(self.fields(res), {"year"})

    def test_unsupported_categories(self):
        self.assertEqual(self.fields(post({**VALID, "state": "Atlantis"})), {"state"})
        self.assertEqual(self.fields(post({**VALID, "season": "Monsoon"})), {"season"})
        self.assertEqual(self.fields(post({**VALID, "crop": "Dragon Fruit"})), {"crop"})

    def test_valid_categories_but_unsupported_combination(self):
        res = post({"state": "Punjab", "season": "Rabi", "crop": "Coconut", "year": 2015})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(self.fields(res), {"crop"})
        self.assertIn("selected state and season", res.get_json()["errors"][0]["message"])

    def test_case_sensitive_and_wrong_types(self):
        self.assertEqual(post({**VALID, "state": "punjab"}).status_code, 400)
        for bad in [5, True, [], {}, "", "   "]:
            self.assertEqual(post({**VALID, "crop": bad}).status_code, 400, bad)

    def test_overlong_text(self):
        self.assertEqual(post({**VALID, "state": "x" * 500}).status_code, 400)

    def test_non_object_and_malformed(self):
        self.assertEqual(post([1]).status_code, 400)
        r = client().post("/yield-prediction/predict", data="{bad", content_type="application/json")
        self.assertEqual(r.status_code, 400)


class ModelUnavailableTests(unittest.TestCase):
    def setUp(self):
        self.empty = YieldPredictor(model_dir=tempfile.mkdtemp())

    def test_endpoints_return_503_and_no_numbers(self):
        c = client(self.empty)
        self.assertEqual(c.get("/yield-prediction/ready").status_code, 503)
        self.assertEqual(c.get("/yield-prediction/options").status_code, 503)
        res = post(VALID, c)
        self.assertEqual(res.status_code, 503)
        self.assertEqual(res.get_json()["code"], "MODEL_UNAVAILABLE")
        self.assertNotIn("data", res.get_json())

    def test_malformed_input_still_400_when_model_missing(self):
        self.assertEqual(post({}, client(self.empty)).status_code, 400)

    def test_missing_only_model_file(self):
        d = Path(tempfile.mkdtemp())
        shutil.copy(PREDICTOR.model_dir / "metadata.json", d / "metadata.json")
        self.assertFalse(YieldPredictor(model_dir=d).ready)

    def test_corrupt_model_file(self):
        d = Path(tempfile.mkdtemp())
        shutil.copy(PREDICTOR.model_dir / "metadata.json", d / "metadata.json")
        (d / "model.joblib").write_bytes(b"garbage")
        self.assertFalse(YieldPredictor(model_dir=d).ready)

    def test_refuses_metadata_declaring_area_or_production(self):
        d = Path(tempfile.mkdtemp())
        shutil.copy(PREDICTOR.model_dir / "model.joblib", d / "model.joblib")
        bad = {**META, "featureOrder": ["state", "season", "crop", "year", "area"]}
        (d / "metadata.json").write_text(json.dumps(bad))
        self.assertFalse(YieldPredictor(model_dir=d).ready)


class ApiKeyAndSeparationTests(unittest.TestCase):
    def tearDown(self):
        os.environ.pop("ML_SERVICE_API_KEY", None)

    def test_key_required_when_configured(self):
        os.environ["ML_SERVICE_API_KEY"] = "s3cret"
        c = client()
        self.assertEqual(post(VALID, c).status_code, 401)
        self.assertEqual(c.get("/yield-prediction/options").status_code, 401)
        ok = c.post("/yield-prediction/predict", json=VALID, headers={"X-Internal-Api-Key": "s3cret"})
        self.assertEqual(ok.status_code, 200)

    def test_modules_are_independent(self):
        root = Path(__file__).resolve().parent.parent
        import re
        imports = lambda f, mod: re.search(rf"^\s*(from|import)\s+{mod}\b", f.read_text(), re.M)  # noqa: E731
        for f in (root / "yield_prediction").glob("*.py"):
            self.assertIsNone(imports(f, "crop_recommendation"), f.name)
        for f in (root / "crop_recommendation").glob("*.py"):
            self.assertIsNone(imports(f, "yield_prediction"), f.name)


if __name__ == "__main__":
    unittest.main()
