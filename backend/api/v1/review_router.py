from fastapi import APIRouter, Depends, Body, Request, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import text
from core.database import get_db
from schemas.review import ReviewPackageResponse, HumanReviewSubmit
from schemas.measurement import WaterMeasurementResponse
from services.review_service import review_service

router = APIRouter(prefix="/review", tags=["Human-in-the-Loop & Review Agent"])

@router.get("/package/{measurement_id}", response_model=ReviewPackageResponse)
def get_review_package(measurement_id: int, station_code: str = "STN-BANGSALA", db: Session = Depends(get_db)):
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

@router.get("/retrain-status")
def get_retrain_status(db: Session = Depends(get_db)):
    """ส่งคืนสถานะตัวนับการตรวจทาน (0/20) ข้อมูลโมเดลปัจจุบัน และประวัติการ Retrain"""
    return review_service.get_retrain_status(db=db)

@router.post("/trigger-retrain")
def trigger_manual_retrain(background_tasks: BackgroundTasks):
    """สั่ง Retrain โมเดลทันทีโดยไม่ต้องรอให้ครบ 20 ภาพ (Manual Override)"""
    # Execute immediately and return result
    result = review_service.execute_retrain_job(trigger_type="MANUAL_OVERRIDE")
    return {
        "message": "Manual Retraining completed successfully!",
        "result": result
    }

@router.post("/webhook/label-studio")
async def label_studio_webhook(payload: dict = Body(...), db: Session = Depends(get_db)):
    """
    Webhook อัตโนมัติจาก Label Studio:
    เมื่อผู้ใช้ตรวจทานเสร็จแล้วกด [Submit] หรือ [Update] ใน Label Studio
    ระบบจะ:
    1. นำผลตรวจทานจริงไปเทียบกับค่า AI คำนวณความคลาดเคลื่อนจริง และบันทึกเข้า MLflow ทันที
    2. เพิ่มตัวนับภาพที่ตรวจแล้ว +1 และหากสะสมครบ 20 ภาพ จะสั่งรัน Retrain โมเดลใหม่อัตโนมัติทันที
    """
    action = payload.get("action", "ANNOTATION_CREATED")
    annotation = payload.get("annotation", {})
    task = payload.get("task", {})

    task_id = task.get("id") or annotation.get("task")
    if not task_id:
        return {"status": "skipped", "reason": "No task_id found in webhook payload"}

    human_result = annotation.get("result", [])
    completed_by = annotation.get("completed_by", {})
    reviewer = completed_by.get("email", "hydrologist_operator") if isinstance(completed_by, dict) else "hydrologist_operator"

    # ดึงข้อมูล Task และ AI Prediction จริงจากฐานข้อมูล
    row = db.execute(
        text("SELECT t.data, p.result FROM task t LEFT JOIN prediction p ON p.task_id = t.id WHERE t.id = :tid"),
        {"tid": task_id}
    ).fetchone()

    task_data = row[0] if (row and row[0]) else task.get("data", {})
    ai_result = row[1] if (row and row[1]) else []

    station_name = task_data.get("station_name") or task.get("data", {}).get("station_name") or "Ban Muangkong"

    # 1. Evaluate & Log to MLflow
    evaluation = review_service.evaluate_and_log_to_mlflow(
        task_id=task_id,
        station_name=station_name,
        human_result=human_result,
        ai_result=ai_result,
        reviewer=reviewer
    )

    # 2. Register Review Count & Trigger Auto-Retrain when reaching 20
    retrain_signal = review_service.register_review_submission(task_id=task_id)
    evaluation["retrain_signal"] = retrain_signal

    return evaluation
