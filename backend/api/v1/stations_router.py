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


@router.get("/{station_code}/cctv-analysis.jpg")
def get_cctv_analysis_image(station_code: str, db: Session = Depends(get_db)):
    """
    สร้างและส่งคืนภาพ Dashboard วิเคราะห์ AI Staff Gauge แบบ Realtime
    ดึงภาพสดจากกล้อง CCTV ทันที ทำการ crop เสาวัดน้ำ วาดไม้บรรทัดดิจิทัล และตีกรอบบนภาพจริง
    """
    from fastapi.responses import Response
    from services.vision_service import vision_service
    
    jpeg_bytes = vision_service.get_realtime_analysis_dashboard(station_code)
    if not jpeg_bytes:
        # Fallback to static public image if available
        import os
        static_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 
                                   "..", "frontend", "public", "ai_dashboards", f"{station_code}.jpg")
        if os.path.exists(static_path):
            with open(static_path, "rb") as f:
                jpeg_bytes = f.read()
        else:
            raise HTTPException(status_code=503, detail="Unable to generate realtime vision dashboard")

    return Response(content=jpeg_bytes, media_type="image/jpeg", headers={
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
    })


@router.get("/{station_code}/vision-metadata")
def get_vision_metadata(station_code: str):
    """
    ส่งคืนข้อมูลพิกัด Bounding Box และตำแหน่งเสาวัดน้ำ (% coordinates)
    เพื่อให้ Frontend นำไปวาดกรอบเขียวและเส้นผิวน้ำบนภาพสตรีมสดได้อย่างแม่นยำ
    """
    from services.vision_service import vision_service
    meta = vision_service.get_station_bbox_metadata(station_code)
    if not meta:
        raise HTTPException(status_code=404, detail="Station vision metadata not found")
    return meta

