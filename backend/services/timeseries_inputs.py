"""Translate ecosystem IDs and verified UTC telemetry into model-local hourly inputs."""
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
from hatyai_timeseries import ForecastInputError
from models.measurement import WaterMeasurement, RainfallMeasurement

STATION_MAPPING = {"STN-MUANGKONG": "X.173A", "STN-BANGSALA": "X.90", "STN-HATYAINAI": "X.44"}
RAIN_MAPPING = {"SLA003": "STN-MUANGKONG", "SLA002": "STN-BANGSALA", "SLA001": "STN-HATYAINAI"}
VERIFIED_WATER_SOURCE = "RID_API_VERIFIED"
VERIFIED_RAIN_SOURCE = "HII_API_VERIFIED"


def station_codes(code):
    if code in STATION_MAPPING:
        return code, STATION_MAPPING[code]
    for ecosystem, model in STATION_MAPPING.items():
        if code == model:
            return ecosystem, model
    raise ForecastInputError("Unsupported forecast station")


def utc_naive(value):
    stamp = pd.Timestamp(value)
    if pd.isna(stamp):
        raise ForecastInputError("Invalid timestamp")
    return (stamp.tz_localize("UTC") if stamp.tzinfo is None else stamp.tz_convert("UTC")).to_pydatetime().replace(tzinfo=None)


def load_observations(db, station_code, max_age_minutes=120, now=None):
    now = utc_naive(now or datetime.now(timezone.utc))
    latest = db.query(WaterMeasurement).filter(
        WaterMeasurement.station_code == station_code,
        WaterMeasurement.source_type == VERIFIED_WATER_SOURCE,
        WaterMeasurement.timestamp <= now, WaterMeasurement.created_at <= now,
    ).order_by(WaterMeasurement.timestamp.desc(), WaterMeasurement.created_at.desc(), WaterMeasurement.id.desc()).first()
    if latest is None:
        raise ForecastInputError("No verified RID water observations for this station")
    issue = utc_naive(latest.timestamp)
    if (now - issue).total_seconds() > max_age_minutes * 60:
        raise ForecastInputError(f"Verified water observation is older than {max_age_minutes} minutes")
    if issue.minute or issue.second or issue.microsecond:
        raise ForecastInputError("Verified RID observation must be an exact hour")
    since = issue - timedelta(hours=24)
    water = db.query(WaterMeasurement).filter(
        WaterMeasurement.station_code.in_(list(STATION_MAPPING)),
        WaterMeasurement.source_type == VERIFIED_WATER_SOURCE,
        WaterMeasurement.timestamp >= since, WaterMeasurement.timestamp <= issue,
        WaterMeasurement.created_at <= now,
    ).order_by(WaterMeasurement.created_at.asc(), WaterMeasurement.id.asc()).all()
    rain = db.query(RainfallMeasurement).filter(
        RainfallMeasurement.station_code.in_(list(RAIN_MAPPING) + list(RAIN_MAPPING.values())),
        RainfallMeasurement.source_type == VERIFIED_RAIN_SOURCE,
        RainfallMeasurement.timestamp >= since, RainfallMeasurement.timestamp <= issue,
        RainfallMeasurement.created_at <= now,
    ).order_by(RainfallMeasurement.created_at.asc(), RainfallMeasurement.id.asc()).all()
    rows, refs = {}, {}
    for record in water:
        timestamp = utc_naive(record.timestamp)
        if timestamp.minute or timestamp.second or timestamp.microsecond:
            continue
        column = f"level_{STATION_MAPPING[record.station_code]}"
        value = float(record.water_level)
        value = value if np.isfinite(value) and value not in (-999, 9999, 999999) else None
        rows.setdefault(timestamp, {})[column] = value
        refs[(timestamp, column)] = {"table": "water_measurements", "id": record.id, "source": record.source_type}
    for record in rain:
        timestamp = utc_naive(record.timestamp)
        if timestamp.minute or timestamp.second or timestamp.microsecond:
            continue
        code = record.station_code if record.station_code in RAIN_MAPPING else next(k for k, v in RAIN_MAPPING.items() if v == record.station_code)
        column = f"rain_{code}"
        value = float(record.rain_amount_1h) if record.rain_amount_1h is not None else np.nan
        value = value if np.isfinite(value) and value >= 0 and value not in (9999, 999999) else None
        rows.setdefault(timestamp, {})[column] = value
        refs[(timestamp, column)] = {"table": "rainfall_measurements", "id": record.id, "source": record.source_type}
    observations = [{"time": pd.Timestamp(t, tz="UTC").isoformat(), **values} for t, values in sorted(rows.items())]
    references = [{"time": pd.Timestamp(t, tz="UTC").isoformat(), "column": column, **ref} for (t, column), ref in sorted(refs.items())]
    return observations, pd.Timestamp(issue, tz="UTC").isoformat(), references
