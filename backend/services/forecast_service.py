import hashlib
import json
from datetime import datetime, timedelta, timezone
from functools import lru_cache

import numpy as np
import pandas as pd
from hatyai_timeseries import Forecaster, ForecastInputError
from sqlalchemy.exc import IntegrityError
from core.config import settings
from models.forecast import ForecastRecord
from models.measurement import WaterMeasurement
from services.timeseries_inputs import load_observations, station_codes, utc_naive, VERIFIED_WATER_SOURCE


@lru_cache(maxsize=1)
def get_forecaster():
    return Forecaster(model_dir=settings.forecast_model_dir)


class ForecastService:
    @staticmethod
    def query(db, station_code, mode="shadow", family="delta"):
        ecosystem, _ = station_codes(station_code)
        return db.query(ForecastRecord).filter(
            ForecastRecord.station_code == ecosystem,
            ForecastRecord.model_version == f"rf-v2-{mode}",
            ForecastRecord.model_name == f"Random Forest {family}",
            ForecastRecord.context_json.isnot(None),
        )

    @classmethod
    def get_latest_forecast(cls, db, station_code, mode="shadow", family="delta"):
        query = cls.query(db, station_code, mode, family)
        if mode == "shadow":
            now = datetime.now(timezone.utc).replace(tzinfo=None)
            query = query.filter(ForecastRecord.forecast_time <= now, ForecastRecord.forecast_time >= now - timedelta(minutes=settings.forecast_max_age_minutes))
        return query.order_by(ForecastRecord.forecast_time.desc(), ForecastRecord.created_at.desc(), ForecastRecord.id.desc()).first()

    @classmethod
    def get_history(cls, db, station_code, mode="shadow", family="delta", start=None, end=None, limit=100):
        query = cls.query(db, station_code, mode, family)
        if start:
            query = query.filter(ForecastRecord.forecast_time >= utc_naive(start))
        if end:
            query = query.filter(ForecastRecord.forecast_time <= utc_naive(end))
        return query.order_by(ForecastRecord.forecast_time.desc(), ForecastRecord.id.desc()).limit(limit).all()

    @staticmethod
    def run_forecast(db, station_code, family="delta", mode="shadow", issue_time=None, observations=None, replay_source=None, replay_refs=None):
        ecosystem, model_code = station_codes(station_code)
        if mode == "shadow":
            if issue_time or observations is not None:
                raise ForecastInputError("Shadow uses verified database telemetry; custom input requires replay")
            observations, issue_time, refs = load_observations(db, ecosystem, settings.forecast_max_age_minutes)
        elif mode == "replay":
            if issue_time is None or observations is None:
                raise ForecastInputError("Replay requires issue_time and observations in the JSON body")
            refs = replay_refs or []
        else:
            raise ForecastInputError("Unknown forecast mode")
        forecaster = get_forecaster()
        features = forecaster.build_features(observations, issue_time, model_code, family)
        result = forecaster.predict_features(features, issue_time, model_code, family)
        result.update({
            "model_station_code": model_code, "station_code": ecosystem,
            "mode": mode, "model_name": f"Random Forest {family}", "model_version": f"rf-v2-{mode}",
            "input_source": "Verified database RID/HII telemetry" if mode == "shadow" else replay_source or "Caller-supplied historical observations",
            "observation_refs": refs, "alert_dispatched": False,
            "input_features": {k: None if pd.isna(v) else float(v) for k, v in features.items()},
        })
        used = {"station": ecosystem, "mode": mode, "issue_time": result["issue_time"], "family": family, "features": result["input_features"], "artifacts": result["model_artifacts"]}
        key = hashlib.sha256(json.dumps(used, sort_keys=True, allow_nan=False).encode()).hexdigest()
        existing = db.query(ForecastRecord).filter(ForecastRecord.forecast_key == key).first()
        if existing:
            return existing
        record = ForecastRecord(
            station_code=ecosystem, forecast_time=utc_naive(result["issue_time"]),
            predicted_1h=result["predictions"][0]["level_m"], predicted_2h=result["predictions"][1]["level_m"], predicted_3h=result["predictions"][2]["level_m"],
            model_name=result["model_name"], model_version=result["model_version"],
            input_mode=("RID_HII_API" if result["rain_available"] else "RID_API_ONLY") if mode == "shadow" else "REPLAY",
            data_quality_status=result["input_quality"], context_json=result, forecast_key=key,
        )
        db.add(record)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            existing = db.query(ForecastRecord).filter(ForecastRecord.forecast_key == key).first()
            if existing:
                return existing
            raise
        db.refresh(record)
        return record

    @staticmethod
    def compare_forecast(db, record):
        items = []
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        for horizon in (1, 2, 3):
            target = record.forecast_time + timedelta(hours=horizon)
            actual = db.query(WaterMeasurement).filter(
                WaterMeasurement.station_code == record.station_code,
                WaterMeasurement.source_type == VERIFIED_WATER_SOURCE,
                WaterMeasurement.timestamp == target, WaterMeasurement.timestamp <= now, WaterMeasurement.created_at <= now,
            ).order_by(WaterMeasurement.created_at.desc(), WaterMeasurement.id.desc()).first()
            predicted = getattr(record, f"predicted_{horizon}h")
            level = actual.water_level if actual else None
            if level is not None and (not np.isfinite(level) or level in (-999, 9999, 999999)):
                level = None
            items.append({"lead_time_hours": horizon, "target_time": pd.Timestamp(target, tz="UTC").isoformat(), "predicted_level": predicted, "actual_level": level, "mae_error": abs(predicted - level) if level is not None else None})
        return {"forecast_id": record.id, "station_code": record.station_code, "items": items}


forecast_service = ForecastService()
