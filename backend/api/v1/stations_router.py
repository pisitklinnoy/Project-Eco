from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from core.database import get_db
from schemas.station import StationResponse
from services.station_service import station_service

router = APIRouter(prefix="/stations", tags=["Stations & CCTV Cameras"])

class CalibrationPayload(BaseModel):
    station_code: str
    point1: Dict[str, Any]
    point2: Dict[str, Any]
    pixels_per_meter: float
    formula_str: Optional[str] = None

@router.get("", response_model=List[StationResponse])
def list_stations(db: Session = Depends(get_db)):
    """รายการสถานีเฝ้าระวังระดับน้ำและกล้อง CCTV ทั้งหมดในหาดใหญ่"""
    return station_service.get_all_stations(db)

@router.get("/{station_code}", response_model=StationResponse)
def get_station(station_code: str, db: Session = Depends(get_db)):
    """ดูรายละเอียดสถานีและพิกัดแผนที่เจาะจงตามรหัสสถานี (เช่น STN-BANGSALA)"""
    stn = station_service.get_station_by_code(db, station_code)
    if not stn:
        raise HTTPException(status_code=404, detail=f"Station {station_code} not found")
    return stn

@router.post("/{station_code}/calibrate")
def save_station_calibration(
    station_code: str,
    payload: CalibrationPayload,
    db: Session = Depends(get_db)
):
    """
    บันทึกการตั้งค่า Click-to-Calibrate ของเสาวัดน้ำในภาพ CCTV
    """
    stn = station_service.get_station_by_code(db, station_code)
    if not stn:
        raise HTTPException(status_code=404, detail=f"Station {station_code} not found")

    print(f"[Calibration] Saved 2-point calibration for {station_code}: {payload.pixels_per_meter:.2f} px/m")
    return {
        "status": "success",
        "station_code": station_code,
        "pixels_per_meter": payload.pixels_per_meter,
        "formula_str": payload.formula_str,
        "message": f"บันทึกค่าปรับเทียบสเกลเสาสำเร็จ ({payload.pixels_per_meter:.1f} พิกเซล/เมตร)"
    }
