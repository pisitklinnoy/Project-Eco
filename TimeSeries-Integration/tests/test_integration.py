import hashlib
import json
import unittest
from pathlib import Path

import pandas as pd
from hatyai_timeseries import Forecaster, ForecastInputError

ROOT = Path(__file__).resolve().parents[1]


class IntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = Forecaster()
        cls.sample = pd.read_csv(ROOT / "examples/observations.csv")
        cls.reference = json.loads((ROOT / "examples/reference_predictions.json").read_text(encoding="utf-8"))

    def test_all_models_match_original_feature_matrix_and_predictions(self):
        for key, expected in self.reference.items():
            station, family = key.split("/")
            with self.subTest(station=station, family=family):
                features = self.engine.build_features(self.sample, "2025-01-10T00:00:00+07:00", station, family)
                for name, value in expected["features"].items():
                    if value is None:
                        self.assertTrue(pd.isna(features[name]))
                    else:
                        self.assertAlmostEqual(features[name], value, places=10)
                result = self.engine.predict(self.sample, "2025-01-10T00:00:00+07:00", station, family)
                for prediction, value in zip(result["predictions"], expected["levels_m"]):
                    self.assertAlmostEqual(prediction["level_m"], value, places=10)
                json.dumps(result, allow_nan=False)

    def test_future_rows_do_not_change_prediction(self):
        future = self.sample.iloc[[-1]].copy()
        future["time"] = "2025-01-10 01:00:00"
        for column in future.columns.drop("time"):
            future[column] = 99999.0
        combined = pd.concat([self.sample, future], ignore_index=True)
        before = self.engine.predict(self.sample, "2025-01-10")
        after = self.engine.predict(combined, "2025-01-10")
        self.assertEqual(before["predictions"], after["predictions"])

    def test_missing_rain_is_reported_and_missing_current_water_is_blocked(self):
        partial = self.sample.drop(columns=[c for c in self.sample if c.startswith("rain_")])
        result = self.engine.predict(partial, "2025-01-10")
        self.assertFalse(result["rain_available"])
        self.assertEqual(result["input_quality"], "PARTIAL_INPUTS")
        with self.assertRaises(ForecastInputError):
            self.engine.predict(partial.drop(columns=["level_X.44"]), "2025-01-10")

    def test_duplicates_invalid_hours_and_target_columns_are_rejected(self):
        with self.assertRaises(ForecastInputError):
            self.engine.predict(pd.concat([self.sample, self.sample.iloc[[0]]]), "2025-01-10")
        with self.assertRaises(ForecastInputError):
            self.engine.predict(self.sample, "2025-01-10 00:30")
        with self.assertRaises(ForecastInputError):
            self.engine.predict_features({"target_level_plus_1h": 1}, "2025-01-10")

    def test_utc_issue_time_matches_thai_time(self):
        local = self.engine.predict(self.sample, "2025-01-10T00:00:00+07:00")
        utc = self.engine.predict(self.sample, "2025-01-09T17:00:00+00:00")
        self.assertEqual(local["predictions"], utc["predictions"])

    def test_artifact_checksums(self):
        directory = ROOT / "hatyai_timeseries/models"
        manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(len(manifest), 18)
        for item in manifest:
            self.assertEqual(hashlib.sha256((directory / item["file"]).read_bytes()).hexdigest(), item["sha256"])


if __name__ == "__main__":
    unittest.main()
