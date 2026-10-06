import json
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from core.database import get_db
from schemas.vision_ondemand import BoundingBox, CalibrationPoint, OnDemandPredictResponse
from services.ondemand_vision_service import ondemand_vision_service

router = APIRouter(prefix="/vision", tags=["On-Demand Vision Predictor"])

@router.post("/predict-custom-image", response_model=OnDemandPredictResponse)
async def predict_custom_image(
    image: UploadFile = File(..., description="ไฟล์ภาพถ่ายเสาวัดน้ำ"),
    bbox: str = Form(..., description='JSON string ของ Bounding Box เช่น {"x": 100, "y": 50, "width": 40, "height": 300}'),
    point_high: str = Form(..., description='JSON string ของจุดเทียบสเกลสูง เช่น {"x": 120, "y": 70, "actual_meter": 0.90}'),
    point_low: str = Form(..., description='JSON string ของจุดเทียบสเกลต่ำ เช่น {"x": 120, "y": 280, "actual_meter": 0.60}'),
    point_water: Optional[str] = Form(None, description='JSON string ของจุดผิวน้ำที่ผู้ใช้ระบุ เช่น {"x": 120, "y": 180, "actual_meter": 0.75}'),
    station_note: Optional[str] = Form("On-Demand Field Inspection", description="บันทึกสถานที่หรือหมายเหตุ"),
    db: Session = Depends(get_db)
):
    """
    On-Demand Water Level Image Predictor:
    1. รับภาพและพิกัด Bounding Box ครอบตัวเสา + พิกัด 2 จุด Calibration + จุดผิวน้ำ (ถ้ามี)
    2. ทำการ Crop ภาพตาม Bounding Box
    3. คำนวณหาตำแหน่งผิวน้ำ (Manual Pinpoint หรือ Auto 1D Change Point Analysis)
    4. ทำ Linear Interpolation แปลงเป็นระดับน้ำจริง (เมตร รทก.)
    5. อัปโหลดภาพเข้า MinIO และสร้าง Task พร้อม Pre-annotations ใน Label Studio อัตโนมัติ (Active Learning Loop)
    """
    try:
        bbox_data = json.loads(bbox)
        parsed_bbox = BoundingBox(**bbox_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid bbox JSON format: {e}")

    try:
        pt_high_data = json.loads(point_high)
        parsed_pt_high = CalibrationPoint(**pt_high_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid point_high JSON format: {e}")

    try:
        pt_low_data = json.loads(point_low)
        parsed_pt_low = CalibrationPoint(**pt_low_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid point_low JSON format: {e}")

    parsed_pt_water = None
    if point_water:
        try:
            pt_water_data = json.loads(point_water)
            parsed_pt_water = CalibrationPoint(**pt_water_data)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid point_water JSON format: {e}")

    image_bytes = await image.read()
    if len(image_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded image is empty")

    try:
        result = ondemand_vision_service.process_and_predict(
            image_bytes=image_bytes,
            bbox=parsed_bbox,
            pt_high=parsed_pt_high,
            pt_low=parsed_pt_low,
            db=db,
            station_note=station_note,
            pt_water=parsed_pt_water
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Vision processing failed: {str(e)}")
