from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from hatyai_timeseries import ForecastInputError
from core.database import get_db
from core.config import settings
from models.forecast import ForecastRecord
from models.station import Station
from schemas.forecast import ForecastResponse, ReplayForecastInput, ForecastComparisonResponse
from services.forecast_service import forecast_service
from services.timeseries_inputs import STATION_MAPPING, station_codes, load_observations

router = APIRouter(prefix="/forecast", tags=["Flood Forecasting"])


def validate_station(station_code):
    try:
        return station_codes(station_code)
    except ForecastInputError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("/catalog")
def catalog():
    return {"stations": STATION_MAPPING, "families": ["delta", "level"], "modes": ["shadow", "replay"], "operational_ready": False}


@router.post("/refresh-all")
def refresh_all(db: Session = Depends(get_db)):
    """Refresh verified telemetry and calculate all stations, labelling delayed data as replay."""
    from services.telemetry_service import telemetry_service
    from services.station_service import station_service
    station_service.get_all_stations(db)
    telemetry = telemetry_service.ingest_all(db)
    failures = [f"{name}: {result['reason']}" for name, result in telemetry.items() if result['status'] == 'unavailable']
    ingestion_error = '; '.join(failures) or None
    results = []
    for code in STATION_MAPPING:
        try:
            observations, issue, refs = load_observations(db, code, 1440)
            age_minutes = (datetime.now(timezone.utc) - datetime.fromisoformat(issue)).total_seconds() / 60
            mode = "shadow" if age_minutes <= settings.forecast_max_age_minutes else "replay"
            record = forecast_service.run_forecast(
                db, code, settings.forecast_model_family, mode,
                issue_time=issue if mode == "replay" else None,
                observations=observations if mode == "replay" else None,
                replay_source="Verified database RID/HII telemetry (delayed observations)",
                replay_refs=refs,
            )
            results.append({"station_code": code, "forecast": ForecastResponse.model_validate(record).model_dump(mode="json"), "error": None})
        except ForecastInputError as exc:
            results.append({"station_code": code, "forecast": None, "error": str(exc)})
    return {"stations": results, "ingestion_error": ingestion_error, "telemetry": telemetry}


@router.get("/latest", response_model=ForecastResponse)
def latest(station_code: str = "STN-BANGSALA", mode: Literal["shadow", "replay"] = "shadow",
           family: Literal["delta", "level"] = settings.forecast_model_family, db: Session = Depends(get_db)):
    validate_station(station_code)
    record = forecast_service.get_latest_forecast(db, station_code, mode, family)
    if record is None:
        raise HTTPException(404, "No recent model forecast for this station and mode")
    return record


@router.post("/trigger", response_model=ForecastResponse)
def trigger(station_code: str = "STN-BANGSALA", mode: Literal["shadow", "replay"] = "shadow",
            family: Literal["delta", "level"] = settings.forecast_model_family, payload: ReplayForecastInput | None = None,
            db: Session = Depends(get_db)):
    validate_station(station_code)
    try:
        return forecast_service.run_forecast(db, station_code, family, mode,
                                            payload.issue_time if payload else None,
                                            payload.observations if payload else None)
    except ForecastInputError as exc:
        raise HTTPException(503 if mode == "shadow" else 422, str(exc)) from exc


@router.get("/history", response_model=list[ForecastResponse])
def history(station_code: str = "STN-BANGSALA", mode: Literal["shadow", "replay"] = "shadow",
            family: Literal["delta", "level"] = settings.forecast_model_family, start: datetime | None = None,
            end: datetime | None = None, limit: int = Query(100, ge=1, le=1000), db: Session = Depends(get_db)):
    validate_station(station_code)
    if start and end and start.replace(tzinfo=start.tzinfo or timezone.utc) > end.replace(tzinfo=end.tzinfo or timezone.utc):
        raise HTTPException(422, "start must precede end")
    return forecast_service.get_history(db, station_code, mode, family, start, end, limit)


@router.get("/{record_id}/comparison", response_model=ForecastComparisonResponse)
def comparison(record_id: int, db: Session = Depends(get_db)):
    record = db.query(ForecastRecord).filter(ForecastRecord.id == record_id).first()
    if record is None or record.context_json is None or not record.model_version.startswith("rf-v2-"):
        raise HTTPException(404, "Model forecast not found")
    return forecast_service.compare_forecast(db, record)


@router.post("/simulate", response_model=ForecastResponse)
def simulate(station_code: str = "STN-BANGSALA", rain_surge_mm: float = Query(0, ge=0, le=1000),
             upstream_surge_percent: float = Query(0, ge=0, le=100), gate_r1_open_percent: float = Query(50, ge=0, le=100),
             sea_tide_surge_m: float = Query(0, ge=0, le=20), db: Session = Depends(get_db)):
    """Preserve the interactive heuristic simulator without storing it as an AI forecast."""
    ecosystem, _ = validate_station(station_code)
    station = db.query(Station).filter(Station.station_code == ecosystem).first()
    base = station.normal_level if station else 3.2
    delta = round(rain_surge_mm * 0.018 + upstream_surge_percent / 100 * 1.8 - (gate_r1_open_percent - 50) / 100 * 0.8 + sea_tide_surge_m * 0.45, 2)
    current = round(max(0.5, base + delta), 2)
    now = datetime.now(timezone.utc)
    return {
        "id": 0, 
        "station_code": ecosystem, 
        "forecast_time": now, 
        "created_at": now,
        "predicted_1h": round(current + delta * 0.15 + 0.1, 2),
        "predicted_2h": round(current + delta * 0.30 + 0.22, 2),
        "predicted_3h": round(current + delta * 0.45 + 0.35, 2),
        "model_name": "What-If-Hydrological-Simulator", 
        "model_version": "v1.0-interactive",
        "input_mode": "SIMULATION", 
        "data_quality_status": "HEURISTIC_SCENARIO",
        "context_json": {"mode": "simulation", "operational_ready": False, "current_level_m": current}
    }

