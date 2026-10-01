from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from core.database import get_db
from models.station import Station
from schemas.forecast import ForecastResponse
from services.forecast_service import forecast_service

router = APIRouter(prefix="/forecast", tags=["Flood Forecasting"])

@router.get("/latest", response_model=ForecastResponse)
def get_latest_forecast(station_code: str = "STN-BANGSALA", db: Session = Depends(get_db)):
    """ผลการพยากรณ์ระดับน้ำล่วงหน้า 1, 2, และ 3 ชั่วโมงล่าสุด"""
    return forecast_service.get_latest_forecast(db, station_code)

@router.post("/trigger", response_model=ForecastResponse)
def trigger_forecast_simulation(station_code: str = "STN-BANGSALA", db: Session = Depends(get_db)):
    """ทดสอบสั่งรันการพยากรณ์รอบใหม่ทันที (สำหรับทดสอบระบบ)"""
    import random
    stn = db.query(Station).filter(Station.station_code == station_code).first()
    base = stn.normal_level if stn else 3.2
    return forecast_service.create_forecast(
        db, 
        station_code=station_code,
        p1=round(base + 0.25, 2),
        p2=round(base + 0.45, 2),
        p3=round(base + 0.65, 2)
    )

@router.post("/simulate", response_model=ForecastResponse)
def simulate_forecast(
    station_code: str = Query("STN-BANGSALA"),
    rain_surge_mm: float = Query(0.0, description="ปริมาณฝนสะสมเพิ่มเติม (มม.)"),
    upstream_surge_percent: float = Query(0.0, description="มวลน้ำหลากจากต้นน้ำ (%)"),
    gate_r1_open_percent: float = Query(50.0, description="การเปิดบาน ปตร. คลอง ร.1 (%)"),
    sea_tide_surge_m: float = Query(0.0, description="ระดับน้ำทะเลหนุน (ม.)"),
    db: Session = Depends(get_db)
):
    """
    What-If Flood Scenario Simulation:
    คำนวณผลกระทบแบบไดนามิก: ฝนตกสะสม, มวลน้ำบางศาลา, การเปิด ปตร. คลอง ร.1, และน้ำทะเลหนุน
    """
    stn = db.query(Station).filter(Station.station_code == station_code).first()
    base_level = stn.normal_level if stn else 3.2

    # ฟังก์ชันทางอุทกวิทยา (Hydrological Impact Formula)
    delta_rain = rain_surge_mm * 0.018 # ฝน 10mm -> น้ำขึ้น ~0.18m
    delta_upstream = (upstream_surge_percent / 100.0) * 1.8 # มวลน้ำสะเดา/บางศาลา สูงสุด +1.8m
    delta_gate = -((gate_r1_open_percent - 50.0) / 100.0) * 0.8 # ปตร. ร.1 ช่วยระบายได้สูงสุด 0.8m
    delta_tide = sea_tide_surge_m * 0.45 # น้ำทะเลหนุนส่งผลชะลอการระบาย

    total_delta = round(delta_rain + delta_upstream + delta_gate + delta_tide, 2)
    simulated_current = round(max(0.5, base_level + total_delta), 2)

    p1 = round(simulated_current + total_delta * 0.15 + 0.10, 2)
    p2 = round(simulated_current + total_delta * 0.30 + 0.22, 2)
    p3 = round(simulated_current + total_delta * 0.45 + 0.35, 2)

    return forecast_service.create_forecast(
        db,
        station_code=station_code,
        p1=p1,
        p2=p2,
        p3=p3,
        model_name="What-If-Hydrological-Simulator",
        model_version="v1.0-interactive"
    )
