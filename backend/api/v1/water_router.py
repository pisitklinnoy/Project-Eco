from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List
from core.database import get_db
from schemas.measurement import WaterMeasurementResponse
from services.water_service import water_service

router = APIRouter(prefix="/water", tags=["Water Level & Rainfall"])

@router.get("/latest", response_model=WaterMeasurementResponse)
def get_latest_water(station_code: str = "STN-BANGSALA", db: Session = Depends(get_db)):
    """ดึงข้อมูลระดับน้ำล่าสุดของสถานี (จาก API หรือกล้อง AI)"""
    return water_service.get_latest_measurement(db, station_code)

@router.get("/history", response_model=List[WaterMeasurementResponse])
def get_water_history(
    station_code: str = "STN-BANGSALA", 
    hours: int = Query(24, ge=1, le=168), 
    db: Session = Depends(get_db)
):
    """ดึงข้อมูลระดับน้ำย้อนหลังสำหรับวาดกราฟแนวโน้ม (Time-Series Chart)"""
    return water_service.get_historical_measurements(db, station_code, hours)
