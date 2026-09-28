from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from core.database import get_db
from schemas.forecast import ForecastResponse
from services.forecast_service import forecast_service

router = APIRouter(prefix="/forecast", tags=["Flood Forecasting"])

@router.get("/latest", response_model=ForecastResponse)
def get_latest_forecast(station_code: str = "STN-HY01", db: Session = Depends(get_db)):
    """ผลการพยากรณ์ระดับน้ำล่วงหน้า 1, 2, และ 3 ชั่วโมงล่าสุด"""
    return forecast_service.get_latest_forecast(db, station_code)

@router.post("/trigger", response_model=ForecastResponse)
def trigger_forecast_simulation(station_code: str = "STN-HY01", db: Session = Depends(get_db)):
    """ทดสอบสั่งรันการพยากรณ์รอบใหม่ทันที (สำหรับทดสอบระบบ)"""
    import random
    base = round(random.uniform(3.0, 3.8), 2)
    return forecast_service.create_forecast(
        db, 
        station_code=station_code,
        p1=round(base + 0.25, 2),
        p2=round(base + 0.45, 2),
        p3=round(base + 0.65, 2)
    )
