"""Portable inference; ingestion, scheduling and persistence belong to the host app."""
from __future__ import annotations

import hashlib
import re
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import joblib
import numpy as np
import pandas as pd

BANGKOK = ZoneInfo("Asia/Bangkok")
STATIONS = {
    "X.173A": {"name": "บ้านม่วงก็อง", "rain_station": "SLA003"},
    "X.90": {"name": "บ้านบางศาลา", "rain_station": "SLA002"},
    "X.44": {"name": "บ้านหาดใหญ่ใน", "rain_station": "SLA001"},
}


class ForecastInputError(ValueError):
    """The supplied observations do not satisfy the model input contract."""


def _issue_time(value):
    try:
        stamp = pd.Timestamp(value)
        if pd.isna(stamp):
            raise ValueError("missing timestamp")
        stamp = stamp.tz_localize(BANGKOK) if stamp.tzinfo is None else stamp.tz_convert(BANGKOK)
        if stamp != stamp.floor("h"):
            raise ValueError("timestamp must be an exact hour")
        return stamp
    except (ValueError, TypeError) as exc:
        raise ForecastInputError(f"Invalid issue_time: {value}") from exc


class Forecaster:
    def __init__(self, model_dir=None):
        self.model_dir = Path(model_dir) if model_dir else Path(__file__).parent / "models"
        self._models = {}

    def _load(self, station, family, horizon):
        if station not in STATIONS or family not in ("delta", "level"):
            raise ForecastInputError("station must be X.173A/X.90/X.44; family must be delta/level")
        key = (station, family, horizon)
        if key not in self._models:
            path = self.model_dir / f"rf_{family}_{station.replace('.', '')}_{horizon}h.joblib"
            if not path.is_file():
                raise ForecastInputError(f"Model file unavailable: {path.name}")
            model = joblib.load(path)
            names = list(model.feature_names_in_)
            if not names or any(not re.fullmatch(r"(?:level_X\.[\dA]+_lag\d+h|rain_SLA\d+_lag\d+h)", n) for n in names):
                raise ForecastInputError("Unexpected model feature contract")
            if any(n.startswith("rain_") and n.endswith("lag0h") for n in names):
                raise ForecastInputError("Unverified current-hour rain in model")
            model.named_steps["randomforestregressor"].n_jobs = 1
            self._models[key] = (model, path.name, hashlib.sha256(path.read_bytes()).hexdigest())
        return self._models[key]

    def feature_names(self, station="X.44", family="delta"):
        """Return the exact ordered input columns read from the saved model."""
        return list(self._load(station, family, 1)[0].feature_names_in_)

    def build_features(self, observations, issue_time, station="X.44", family="delta"):
        """Wide hourly table: time, level_X.44, rain_SLA001, etc.; no interpolation."""
        issue = _issue_time(issue_time)
        table = pd.DataFrame(observations).copy()
        if "time" not in table:
            raise ForecastInputError("observations must contain a time column")
        try:
            # Naive timestamps are interpreted as Bangkok time, aware values converted.
            times = [_issue_time(t) for t in table.pop("time")]
            table.index = pd.DatetimeIndex(times)
        except (ValueError, TypeError) as exc:
            raise ForecastInputError(f"Invalid observation timestamps: {exc}") from exc
        if table.index.duplicated().any():
            raise ForecastInputError("Duplicate observation hours; resolve revisions before prediction")
        values = {}
        for name in self.feature_names(station, family):
            column, lag = name.rsplit("_lag", 1)
            target = issue - pd.Timedelta(hours=int(lag[:-1]))
            values[name] = table.at[target, column] if column in table and target in table.index else None
        return values

    def predict(self, observations, issue_time, station="X.44", family="delta"):
        features = self.build_features(observations, issue_time, station, family)
        return self.predict_features(features, issue_time, station, family)

    def predict_features(self, features, issue_time, station="X.44", family="delta"):
        """Predict from an already prepared feature mapping; omitted values stay missing."""
        issue = _issue_time(issue_time)
        names = self.feature_names(station, family)
        extras = set(features) - set(names)
        if extras:
            raise ForecastInputError(f"Unexpected features: {sorted(extras)}")
        values = {}
        for name in names:
            raw = features.get(name)
            try:
                value = np.nan if raw is None else float(raw)
            except (ValueError, TypeError) as exc:
                raise ForecastInputError(f"Feature must be numeric or missing: {name}") from exc
            if np.isinf(value):
                raise ForecastInputError(f"Infinite feature value: {name}")
            values[name] = value
        current = values[f"level_{station}_lag0h"]
        if not np.isfinite(current):
            raise ForecastInputError("Current station water level is missing; prediction blocked")
        missing = [name for name in names if np.isnan(values[name])]
        frame = pd.DataFrame([values], columns=names)
        predictions, artifacts = [], []
        for horizon in (1, 2, 3):
            model, filename, sha = self._load(station, family, horizon)
            if list(model.feature_names_in_) != names:
                raise ForecastInputError("Feature contract differs between model horizons")
            result = float(model.predict(frame)[0])
            level = result + current if family == "delta" else result
            if not np.isfinite(level):
                raise ForecastInputError("Non-finite model output")
            predictions.append({"horizon_h": horizon, "target_time": (issue + pd.Timedelta(hours=horizon)).isoformat(), "level_m": level})
            artifacts.append({"file": filename, "sha256": sha})
        return {
            "station_code": station, "station_name": STATIONS[station]["name"],
            "issue_time": issue.isoformat(), "generated_at": datetime.now(BANGKOK).isoformat(),
            "current_level_m": current, "model_family": family, "model_version": "rf-v2",
            "trained_through": "2024-12-31", "unit": "m_reported",
            "predictions": predictions, "model_artifacts": artifacts,
            "input_quality": "PARTIAL_INPUTS" if missing else "COMPLETE_INPUTS",
            "missing_features": missing,
            "rain_available": not any(n.startswith("rain_") for n in missing),
            "missing_input_policy": "Saved training median imputer and missing indicators",
            "operational_ready": False,
        }
