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

class ManualBBoxPayload(BaseModel):
    station_code: str
    bbox: List[int]
    image_resolution: Optional[List[int]] = None
    mode: str = "live"
    label: str = "Staff Gauge"
    notes: Optional[str] = None

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


@router.post("/{station_code}/manual-bbox")
def save_station_manual_bbox(
    station_code: str,
    payload: ManualBBoxPayload,
    db: Session = Depends(get_db)
):
    """
    บันทึกกรอบ Bounding Box เสาวัดน้ำด้วยมือ (Manual BBox Annotation)
    และจัดเก็บภาพ+พิกัดเข้า Dataset เพื่อนำไป Re-train โมเดล YOLO ในภายหลัง
    พร้อมทั้งเปิดใช้งานการวิเคราะห์สเกลเสาและแดชบอร์ดทันที
    """
    from services.vision_service import vision_service
    res = vision_service.save_manual_bbox(
        station_code=station_code,
        bbox=payload.bbox,
        image_resolution=payload.image_resolution,
        mode=payload.mode,
        label=payload.label,
        notes=payload.notes
    )
    if res.get("status") == "error":
        raise HTTPException(status_code=400, detail=res.get("message", "Failed to save manual bbox"))
    return res


@router.get("/{station_code}/detection-status")
def get_station_detection_status(station_code: str, mode: str = "live"):
    """
    ตรวจสอบสถานะว่าโมเดล YOLO (model_best_v2.pt) สามารถตรวจพบเสาวัดระดับน้ำ (Staff Gauge) ในโหมดที่กำหนดหรือไม่
    """
    from services.vision_service import vision_service
    return vision_service.check_detection_status(station_code, mode=mode)


@router.post("/{station_code}/predict-bbox")
def predict_staff_gauge_bbox(station_code: str, mode: str = "live"):
    """
    สั่งให้โมเดล AI (YOLO) ทำนายพิกัดเสาวัดระดับน้ำ (Staff Gauge Bounding Box) ทันทีแบบ On-Demand ตามคำสั่งปุ่มกด
    """
    from services.vision_service import vision_service
    return vision_service.check_detection_status(station_code, mode=mode, force_refresh=True)


@router.get("/{station_code}/cctv-analysis.jpg")
def get_cctv_analysis_image(station_code: str, mode: str = "live", overlay: str = "bbox", view: str = "cctv", db: Session = Depends(get_db)):
    """
    สร้างและส่งคืนภาพ Dashboard วิเคราะห์ AI Staff Gauge แบบ Realtime หรือ Benchmark
    mode: 'live', 'daytime', 'nighttime', 'flood'
    overlay: 'bbox' (กรอบเขียว Bounding Box), 'polygon' (YOLOv8-Seg polygon mask)
    view: 'cctv' (เฉพาะภาพกล้อง CCTV 16:9), 'gauge' (เฉพาะสเกลเสาวัดน้ำดิจิทัล), 'composite' (รวมแดชบอร์ด)
    """
    from fastapi.responses import Response
    from services.vision_service import vision_service
    
    jpeg_bytes = vision_service.get_realtime_analysis_dashboard(station_code, mode=mode, overlay=overlay, view=view)
    if not jpeg_bytes:
        # Fallback to static public image if available
        import os
        pub_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 
                               "..", "frontend", "public", "ai_dashboards")
        candidates = [
            os.path.join(pub_dir, f"{station_code}_{mode}.jpg"),
            os.path.join(pub_dir, f"{station_code}.jpg")
        ]
        for p in candidates:
            if os.path.exists(p):
                with open(p, "rb") as f:
                    jpeg_bytes = f.read()
                    break

        if not jpeg_bytes:
            raise HTTPException(status_code=503, detail="Unable to generate realtime vision dashboard")

    return Response(content=jpeg_bytes, media_type="image/jpeg", headers={
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
    })


@router.get("/{station_code}/live-feed.jpg")
def get_station_live_camera_feed(station_code: str):
    """
    ดึงภาพเฟรมสดจากกล้อง CCTV ของสถานี (รวมกล้อง Axis ta200304 และ hatyaicity)
    ส่งกลับเป็นภาพ JPEG ผ่าน Backend Proxy เพื่อหลีกเลี่ยงปัญหา CORS/Basic Auth ใน Browser
    """
    from fastapi.responses import Response
    from services.vision_service import vision_service
    import cv2
    
    frame = vision_service.fetch_live_frame(station_code)
    if frame is None:
        import os
        from services.vision_service import BASE_DIR
        stn_key = vision_service._resolve_station_key(station_code) or ""
        station_num = "station1_muangkong" if "MUANGKONG" in stn_key or "173A" in stn_key else \
                      "station2_bangsala" if "BANGSALA" in stn_key or "90" in stn_key else \
                      "station3_hatyainai"
        candidates = [
            os.path.join(BASE_DIR, "sample_images", f"{station_num}_daytime.jpg"),
            os.path.join(BASE_DIR, "sample_images", f"{station_num}.jpg"),
        ]
        for p in candidates:
            if os.path.exists(p):
                frame = cv2.imread(p)
                if frame is not None:
                    break

    if frame is None:
        raise HTTPException(status_code=503, detail="CCTV stream currently unreachable")
    
    success, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
    if not success:
        raise HTTPException(status_code=500, detail="Failed to encode image frame")
        
    return Response(content=buffer.tobytes(), media_type="image/jpeg", headers={
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


@router.get("/{station_code}/raw-frame.jpg")
def get_station_raw_frame(station_code: str):
    """
    ส่งคืนภาพต้นฉบับแท้ๆ (100% Clean Raw Image) ปราศจากการวาด Bounding Box หรือ Text Overlay
    เหมาะสำหรับนำไปใช้งานใน On-Demand Predictor และ Label Studio
    """
    import os
    import cv2
    from fastapi.responses import Response
    from services.vision_service import vision_service, BASE_DIR

    stn_key = vision_service._resolve_station_key(station_code)
    station_num = "station1_muangkong" if "MUANGKONG" in stn_key or "173A" in stn_key else \
                  "station2_bangsala" if "BANGSALA" in stn_key or "90" in stn_key else \
                  "station3_hatyainai"

    candidates = [
        os.path.join(BASE_DIR, "sample_images", f"{station_num}_daytime.jpg"),
        os.path.join(BASE_DIR, "sample_images", f"{station_num}.jpg"),
        os.path.join(BASE_DIR, "sample_images", f"{station_num}_flood.png"),
    ]
    frame = None
    for p in candidates:
        if os.path.exists(p):
            frame = cv2.imread(p)
            if frame is not None:
                break

    if frame is None:
        frame = vision_service.fetch_live_frame(station_code)

    if frame is None:
        raise HTTPException(status_code=404, detail="Raw frame not available")

    ret, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 95])
    return Response(content=buf.tobytes(), media_type="image/jpeg", headers={
        "Cache-Control": "no-cache, no-store, must-revalidate"
    })


