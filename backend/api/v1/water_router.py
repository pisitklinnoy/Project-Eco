from fastapi import APIRouter, Depends, Query, HTTPException
from hatyai_timeseries import ForecastInputError
from sqlalchemy.orm import Session
from typing import List
from core.database import get_db
from schemas.measurement import WaterMeasurementResponse
from services.water_service import water_service

router = APIRouter(prefix="/water", tags=["Water Level & Rainfall"])

@router.get("/latest", response_model=WaterMeasurementResponse)
def get_latest_water(station_code: str = "STN-BANGSALA", db: Session = Depends(get_db)):
    """ดึงข้อมูลระดับน้ำล่าสุดของสถานี (จาก API หรือกล้อง AI)"""
    try:
        record = water_service.get_latest_measurement(db, station_code)
    except ForecastInputError as exc:
        raise HTTPException(422, str(exc)) from exc
    if record is None:
        raise HTTPException(404, "No verified water measurement for this station")
    return record

@router.get("/history", response_model=List[WaterMeasurementResponse])
def get_water_history(
    station_code: str = "STN-BANGSALA", 
    hours: int = Query(24, ge=1, le=168), 
    db: Session = Depends(get_db)
):
    """ดึงข้อมูลระดับน้ำย้อนหลังสำหรับวาดกราฟแนวโน้ม (Time-Series Chart)"""
    try:
        return water_service.get_historical_measurements(db, station_code, hours)
    except ForecastInputError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.post("/ingest-rid")
def ingest_rid(db: Session = Depends(get_db)):
    """Read verified RID reports into the ecosystem database; called by the ingestion worker."""
    from services.telemetry_service import telemetry_service
    try:
        return telemetry_service.ingest_rid(db)
    except ForecastInputError as exc:
        raise HTTPException(503, str(exc)) from exc


@router.post("/ingest-telemetry")
def ingest_telemetry(db: Session = Depends(get_db)):
    from services.telemetry_service import telemetry_service
    return telemetry_service.ingest_all(db)


@router.get("/rain/latest")
def latest_rain(station_code: str = "STN-BANGSALA", db: Session = Depends(get_db)):
    from models.measurement import RainfallMeasurement
    from services.timeseries_inputs import station_codes, RAIN_MAPPING, VERIFIED_RAIN_SOURCE
    from datetime import datetime, timezone
    try:
        ecosystem, _ = station_codes(station_code)
    except ForecastInputError as exc:
        raise HTTPException(422, str(exc)) from exc
    gauge = next(code for code, target in RAIN_MAPPING.items() if target == ecosystem)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    record = db.query(RainfallMeasurement).filter(RainfallMeasurement.station_code == gauge,
        RainfallMeasurement.source_type == VERIFIED_RAIN_SOURCE, RainfallMeasurement.timestamp <= now,
        RainfallMeasurement.created_at <= now).order_by(RainfallMeasurement.timestamp.desc(), RainfallMeasurement.created_at.desc(), RainfallMeasurement.id.desc()).first()
    if record is None:
        raise HTTPException(404, "No verified HII rainfall for this station")
    return {"station_code": ecosystem, "rain_station_code": gauge, "timestamp": record.timestamp.replace(tzinfo=timezone.utc).isoformat(),
            "rain_amount_1h": record.rain_amount_1h, "rain_amount_24h": record.rain_amount_24h, "unit": "mm", "source_type": record.source_type,
            "source_url": record.source_url, "age_minutes": (now - record.timestamp).total_seconds() / 60}
