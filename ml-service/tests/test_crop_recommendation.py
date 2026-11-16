"""Flask crop-recommendation tests. Run from ml-service/:  python -m unittest discover -s tests -v"""

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import create_app  # noqa: E402
from crop_recommendation.service import CropRecommender  # noqa: E402

VALID = {
    "nitrogen": 130, "phosphorus": 48, "potassium": 35, "ph": 7.9,
    "temperature": 24, "rainfall": 900, "humidity": 45, "season": "Rabi",
}

RECOMMENDER = CropRecommender()  # load the real model once


def client(recommender=None):
    return create_app(recommender or RECOMMENDER).test_client()


class HealthTests(unittest.TestCase):
    def test_health(self):
        self.assertEqual(client().get("/health").get_json()["status"], "ok")

    def test_ready_with_real_model(self):
        res = client().get("/crop-recommendation/ready")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json()["status"], "ready")


class SuccessTests(unittest.TestCase):
    def test_returns_top_n_crops_from_model(self):
        res = client().post("/crop-recommendation/predict", json=VALID)
        self.assertEqual(res.status_code, 200)
        body = res.get_json()
        self.assertTrue(body["success"])
        recs = body["data"]["recommendations"]
        self.assertEqual(len(recs), 5)
        self.assertEqual([r["rank"] for r in recs], [1, 2, 3, 4, 5])
        known = {c["name"] for c in RECOMMENDER.metadata["crops"]}
        for r in recs:
            self.assertEqual(set(r), {"rank", "crop", "slug"})   # no scores / probabilities leak out
            self.assertIn(r["crop"], known)
            self.assertRegex(r["slug"], r"^[a-z0-9-]+$")
        self.assertEqual(len({r["crop"] for r in recs}), 3)

    def test_output_depends_on_input(self):
        rabi = client().post("/crop-recommendation/predict", json=VALID).get_json()
        kharif = client().post(
            "/crop-recommendation/predict",
            json={**VALID, "season": "Kharif", "rainfall": 2500, "humidity": 80, "temperature": 27, "ph": 6.0},
        ).get_json()
        self.assertNotEqual(
            [r["crop"] for r in rabi["data"]["recommendations"]],
            [r["crop"] for r in kharif["data"]["recommendations"]],
        )

    def test_notice_only_when_outside_training_range(self):
        inside = client().post("/crop-recommendation/predict", json=VALID).get_json()["data"]
        self.assertIsNone(inside["notice"])
        outside = client().post("/crop-recommendation/predict", json={**VALID, "nitrogen": 280}).get_json()["data"]
        self.assertIsInstance(outside["notice"], str)
        self.assertEqual(len(outside["recommendations"]), 5)

    def test_numeric_strings_accepted(self):
        res = client().post("/crop-recommendation/predict", json={**VALID, "nitrogen": "130"})
        self.assertEqual(res.status_code, 200)

    def test_deterministic(self):
        a = client().post("/crop-recommendation/predict", json=VALID).get_json()
        b = client().post("/crop-recommendation/predict", json=VALID).get_json()
        self.assertEqual(a, b)


class InvalidInputTests(unittest.TestCase):
    def post(self, payload):
        return client().post("/crop-recommendation/predict", json=payload)

    def fields(self, res):
        return {e["field"] for e in res.get_json()["errors"]}

    def test_missing_fields(self):
        res = self.post({})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.get_json()["code"], "VALIDATION_ERROR")
        self.assertEqual(self.fields(res), {f for f in VALID})

    def test_out_of_range(self):
        for field, bad in [("ph", 14), ("ph", 1), ("humidity", 101), ("rainfall", -5), ("temperature", 80), ("nitrogen", 9999)]:
            with self.subTest(field=field, value=bad):
                res = self.post({**VALID, field: bad})
                self.assertEqual(res.status_code, 400)
                self.assertEqual(self.fields(res), {field})

    def test_non_numeric_and_bool(self):
        for bad in ["abc", True, [], {}, "", "   "]:
            with self.subTest(value=bad):
                self.assertEqual(self.post({**VALID, "ph": bad}).status_code, 400)

    def test_nan_and_infinity(self):
        for raw in ("NaN", "Infinity"):
            res = client().post(
                "/crop-recommendation/predict",
                data=json.dumps(VALID).replace("7.9", raw), content_type="application/json",
            )
            self.assertEqual(res.status_code, 400, raw)

    def test_invalid_season(self):
        self.assertEqual(self.fields(self.post({**VALID, "season": "Monsoon"})), {"season"})
        self.assertEqual(self.post({**VALID, "season": 3}).status_code, 400)

    def test_unknown_fields_rejected(self):
        res = self.post({**VALID, "crop": "Rice", "__proto__": {}})
        self.assertEqual(res.status_code, 400)
        self.assertIn("crop", self.fields(res))

    def test_non_object_and_malformed_bodies(self):
        self.assertEqual(self.post([1, 2, 3]).status_code, 400)
        res = client().post("/crop-recommendation/predict", data="{not json", content_type="application/json")
        self.assertEqual(res.status_code, 400)
        res = client().post("/crop-recommendation/predict", data="x", content_type="text/plain")
        self.assertEqual(res.status_code, 400)

    def test_oversized_body(self):
        res = client().post(
            "/crop-recommendation/predict", data=json.dumps({"x": "a" * 40000}), content_type="application/json"
        )
        self.assertEqual(res.status_code, 413)


class ModelUnavailableTests(unittest.TestCase):
    def setUp(self):
        self.empty = CropRecommender(model_dir=tempfile.mkdtemp())

    def test_not_ready(self):
        self.assertFalse(self.empty.ready)
        self.assertEqual(client(self.empty).get("/crop-recommendation/ready").status_code, 503)

    def test_predict_returns_503_not_fake_output(self):
        res = client(self.empty).post("/crop-recommendation/predict", json=VALID)
        self.assertEqual(res.status_code, 503)
        self.assertEqual(res.get_json()["code"], "MODEL_UNAVAILABLE")
        self.assertNotIn("data", res.get_json())

    def test_invalid_input_still_400_when_model_down(self):
        self.assertEqual(client(self.empty).post("/crop-recommendation/predict", json={}).status_code, 400)

    def test_corrupt_artifact_reported_unavailable(self):
        d = Path(tempfile.mkdtemp())
        (d / "model.joblib").write_bytes(b"not a model")
        (d / "metadata.json").write_text(json.dumps({"featureOrder": [], "crops": []}))
        self.assertFalse(CropRecommender(model_dir=d).ready)


class ApiKeyTests(unittest.TestCase):
    def setUp(self):
        os.environ["ML_SERVICE_API_KEY"] = "s3cret"

    def tearDown(self):
        os.environ.pop("ML_SERVICE_API_KEY", None)

    def test_key_required_when_configured(self):
        c = client()
        self.assertEqual(c.post("/crop-recommendation/predict", json=VALID).status_code, 401)
        bad = c.post("/crop-recommendation/predict", json=VALID, headers={"X-Internal-Api-Key": "nope"})
        self.assertEqual(bad.status_code, 401)
        ok = c.post("/crop-recommendation/predict", json=VALID, headers={"X-Internal-Api-Key": "s3cret"})
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(c.get("/health").status_code, 200)  # plain health stays open


class SeparationTests(unittest.TestCase):
    def test_no_yield_code_in_crop_package(self):
        pkg = Path(__file__).resolve().parent.parent / "crop_recommendation"
        for f in pkg.glob("*.py"):
            self.assertNotIn("yield_prediction", f.read_text().lower(), f.name)


if __name__ == "__main__":
    unittest.main()
