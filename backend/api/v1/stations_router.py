from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from core.database import get_db
from schemas.station import StationResponse
from services.station_service import station_service

router = APIRouter(prefix="/stations", tags=["Stations & CCTV Cameras"])

@router.get("", response_model=List[StationResponse])
def list_stations(db: Session = Depends(get_db)):
    """รายการสถานีเฝ้าระวังระดับน้ำและกล้อง CCTV ทั้งหมดในหาดใหญ่"""
    return station_service.get_all_stations(db)

@router.get("/{station_code}", response_model=StationResponse)
def get_station(station_code: str, db: Session = Depends(get_db)):
    """ดูรายละเอียดสถานีและพิกัดแผนที่เจาะจงตามรหัสสถานี (เช่น STN-HY01)"""
    stn = station_service.get_station_by_code(db, station_code)
    if not stn:
        raise HTTPException(status_code=404, detail=f"Station {station_code} not found")
    return stn
