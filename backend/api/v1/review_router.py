from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from core.database import get_db
from schemas.review import ReviewPackageResponse, HumanReviewSubmit
from schemas.measurement import WaterMeasurementResponse
from services.review_service import review_service

router = APIRouter(prefix="/review", tags=["Human-in-the-Loop & Review Agent"])

@router.get("/package/{measurement_id}", response_model=ReviewPackageResponse)
def get_review_package(measurement_id: int, station_code: str = "STN-HY01", db: Session = Depends(get_db)):
    """รวบรวมหลักฐานและภาพย้อนหลัง 1 ชม. โดย Review Agent ให้มนุษย์ตรวจทานได้ง่าย"""
    return review_service.compile_review_package(db, station_code, measurement_id)

@router.post("/submit", response_model=WaterMeasurementResponse)
def submit_human_correction(payload: HumanReviewSubmit, db: Session = Depends(get_db)):
    """บันทึกการตรวจทานแก้ไขค่าน้ำจากมนุษย์ และเตรียมข้อมูลสำหรับ Re-train โมเดล"""
    return review_service.apply_human_review(
        db, 
        measurement_id=payload.measurement_id, 
        corrected_level=payload.corrected_water_level,
        reviewer_notes=payload.reviewer_notes
    )
