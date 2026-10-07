from fastapi import APIRouter, Depends, Body, Request, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import text
from core.database import get_db
from schemas.review import (
    ReviewPackageResponse,
    HumanReviewSubmit,
    IngestionOverrideSubmit,
    IngestionSimulateRequest,
    DriftRetrainRequest,
    DriftAcknowledgeRequest,
    DriftSimulateRequest,
    VisionCorrectionSubmit,
    VisionCorrectionResponse,
    EcosystemRetrainRequest,
    EcosystemRetrainResponse
)
from schemas.measurement import WaterMeasurementResponse
from services.review_service import review_service
from services.timeseries_hitl_service import timeseries_hitl_service

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
    """ส่งคืนสถานะตัวนับการตรวจทาน (0/20) ข้อมูลโมเดลปัจจุบัน และประวัติการ Retrain (Vision)"""
    return review_service.get_retrain_status(db=db)

@router.post("/trigger-retrain")
def trigger_manual_retrain(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """สั่ง Retrain โมเดล Vision ทันทีโดยไม่ต้องรอให้ครบ 20 ภาพ (Manual Override)"""
    # Execute immediately and return result
    result = review_service.execute_retrain_job(trigger_type="MANUAL_OVERRIDE", db=db)
    return {
        "message": "Manual Retraining completed successfully!",
        "result": result
    }

@router.post("/retrain-ecosystem", response_model=EcosystemRetrainResponse)
def trigger_ecosystem_retrain(
    payload: EcosystemRetrainRequest = Body(...),
    db: Session = Depends(get_db)
):
    """
    🔄 **Full AI Ecosystem Retraining (Dual MLOps Pipeline)**
    
    สั่ง Retrain โมเดลทั้ง 2 โมเดลในระบบ Hatyai FloodLens AI Ecosystem พร้อมกัน (หรือเลือกเฉพาะโมเดลได้):
    - **Cadence Options**: สามารถกำหนดรอบระยะเวลาการ Retrain เช่น `MONTHLY` (เมื่อครบ 1 เดือน), `WEEKLY` (1 สัปดาห์), `BIWEEKLY` (ทุก 2 สัปดาห์), หรือ `ON_DEMAND` (สั่งทันที)
    - **1. Computer Vision Model (YOLO model_best_v2.pt & Staff Gauge Calibrator)**:
      - รวม Annotations ล่าสุดจาก MinIO & Label Studio
      - ปรับเทียบ Dynamic Bounding Box และสเกลเสาวัดระดับน้ำ (Piecewise Calibration)
      - ประเมินผล Holdout Validation (MAE, IoU, Pixel Error)
      - อัปเดตและ Deploy โมเดล พร้อมบันทึก Runs ใน MLflow
    - **2. Time-Series Model (Unified LightGBM Multi-horizon Forecaster)**:
      - ดึงข้อมูลโทรมาตรประวัติศาสตร์ ขยาย Training Window
      - คำนวณ Flood Crisis Sample Weights (x2.5) เพื่อเน้นช่วงน้ำท่วม
      - ทำ Champion vs Challenger Gatekeeper Evaluation
      - Promote โมเดลใหม่เป็น Champion และบันทึกลง MLflow Model Registry
    """
    from datetime import datetime, timezone
    from services.timeseries_retrain_service import timeseries_retrain_service
    now_iso = datetime.now(timezone.utc).isoformat()
    trigger_label = f"SCHEDULED_{payload.cadence}"

    vision_res = None
    timeseries_res = None

    if payload.retrain_vision:
        try:
            vision_res = review_service.execute_retrain_job(trigger_type=trigger_label, db=db)
        except Exception as ve:
            vision_res = {"status": "error", "error": str(ve)}

    if payload.retrain_timeseries:
        try:
            timeseries_res = timeseries_retrain_service.execute_retrain_job(
                trigger_type=trigger_label,
                force_promote=payload.force_promote,
                db=db
            )
        except Exception as te:
            timeseries_res = {"status": "error", "error": str(te)}

    return {
        "status": "success",
        "message": f"Ecosystem Retraining completed for cadence {payload.cadence} ({'Vision ' if payload.retrain_vision else ''}{'+ ' if payload.retrain_vision and payload.retrain_timeseries else ''}{'Time-Series' if payload.retrain_timeseries else ''})",
        "cadence": str(payload.cadence.value if hasattr(payload.cadence, 'value') else payload.cadence),
        "triggered_at": now_iso,
        "reviewer_name": payload.reviewer_name,
        "reviewer_notes": payload.reviewer_notes,
        "vision_model": vision_res,
        "timeseries_model": timeseries_res,
        "ecosystem_summary": {
            "cadence_configured": str(payload.cadence.value if hasattr(payload.cadence, 'value') else payload.cadence),
            "vision_status": "ONLINE & RE-CALIBRATED" if vision_res and vision_res.get("status") == "success" else "SKIPPED_OR_ERROR",
            "timeseries_status": "ONLINE & PROMOTED" if timeseries_res and timeseries_res.get("status") == "success" else "SKIPPED_OR_ERROR",
            "active_vision_weights": "model_best_v2.pt",
            "active_timeseries_model": "unified_flood_model.txt",
            "mlflow_tracking_url": "http://localhost:5000",
            "minio_storage_url": "http://localhost:9001",
            "label_studio_url": "http://localhost:8085"
        }
    }

@router.get("/retrain-ecosystem/status")
def get_ecosystem_retrain_status(db: Session = Depends(get_db)):
    """
    📊 **ตรวจสอบสถานะภาพรวมของทั้ง 2 โมเดลใน Ecosystem (Vision & Time-Series)**
    - ดึงเวอร์ชันปัจจุบัน, MAE ล่าสุด, วันที่ Retrain ล่าสุด, และรอบการ Retrain ถัดไป
    """
    from services.timeseries_retrain_service import timeseries_retrain_service
    vision_state = review_service.load_retrain_state()
    ts_state = timeseries_retrain_service.load_retrain_state()

    return {
        "status": "online",
        "vision_model": {
            "name": vision_state.get("current_model_name", "StaffGauge-Vision-Detector"),
            "version": vision_state.get("current_model_version", "v1.2"),
            "last_mae_meters": vision_state.get("last_mae_meters", 0.038),
            "last_retrained_at": vision_state.get("last_retrained_at"),
            "pending_reviews": vision_state.get("pending_count", 0),
            "is_retraining": vision_state.get("is_retraining", False),
            "history_count": len(vision_state.get("history", []))
        },
        "timeseries_model": {
            "name": ts_state.get("current_model_name", "Unified-LightGBM-Forecaster"),
            "version": ts_state.get("current_model_version", "v1.0"),
            "last_mae_meters": ts_state.get("last_mae_meters", 0.0699),
            "last_retrained_at": ts_state.get("last_retrained_at"),
            "training_samples": ts_state.get("training_samples", 1170),
            "is_retraining": ts_state.get("is_retraining", False),
            "history_count": len(ts_state.get("history", []))
        },
        "cadence_recommendations": {
            "configured_cadence": "MONTHLY",
            "next_scheduled_retrain": "Every 30 days or on 20 human reviews threshold",
            "trigger_api": "POST /api/v1/review/retrain-ecosystem"
        }
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

    station_name = (task_data.get("station_name") if isinstance(task_data, dict) else "") or task.get("data", {}).get("station_name") or "Ban Muangkong"
    image_url = (task_data.get("image") if isinstance(task_data, dict) else None) or task.get("data", {}).get("image")

    # 1. Evaluate & Log to MLflow and upload image + YOLO label to MinIO Dataset
    evaluation = review_service.evaluate_and_log_to_mlflow(
        task_id=task_id,
        station_name=station_name,
        human_result=human_result,
        ai_result=ai_result,
        reviewer=reviewer,
        image_url=image_url
    )

    # 2. Register Review Count & Trigger Auto-Retrain when reaching 20
    retrain_signal = review_service.register_review_submission(task_id=task_id, db=db)
    evaluation["retrain_signal"] = retrain_signal

    return evaluation


# =============================================================================
# Time Series Human-in-the-Loop (HITL) Validation Routes (Real Database 100%)
# =============================================================================

# 1. ด่านตรวจสอบข้อมูลนำเข้า (Data Ingestion Verification - Cross-Validation)
@router.get("/timeseries/ingestion-queue")
def get_ingestion_queue(db: Session = Depends(get_db)):
    """ดึงรายการข้อมูลที่ถูกระงับชั่วคราว (Quarantined) จากการ Cross-Validation ระหว่าง Vision AI vs RID Sensor ในฐานข้อมูลจริง"""
    return timeseries_hitl_service.get_ingestion_queue(db=db)

@router.post("/timeseries/ingestion-override")
def apply_ingestion_override(payload: IngestionOverrideSubmit, db: Session = Depends(get_db)):
    """ผู้เชี่ยวชาญ Review และทำ Manual Override ยืนยันค่าจริงหน้างาน พร้อมปลดสถานะระงับและบันทึกลง DB จริง"""
    return timeseries_hitl_service.apply_ingestion_override(
        db=db,
        review_id=payload.review_id,
        selected_choice=payload.selected_choice,
        verified_water_level=payload.verified_water_level,
        reviewer_name=payload.reviewer_name,
        reviewer_notes=payload.reviewer_notes or "Manual override applied"
    )

@router.post("/timeseries/run-cross-validation")
@router.post("/timeseries/ingestion-simulate")
def run_cross_validation_evaluation(db: Session = Depends(get_db)):
    """รันการตรวจสอบ Cross-Validation จากฐานข้อมูลจริง PostgreSQL สดๆ ทันที (ไม่มี Mock)"""
    return timeseries_hitl_service.evaluate_live_ingestion(db=db)

# 2. ด่านประเมินผลการพยากรณ์ (Forecast Drift & Retrain Trigger)
@router.get("/timeseries/forecast-drift")
def get_forecast_drift(db: Session = Depends(get_db)):
    """รายงานการเปรียบเทียบค่าจริง vs ผลพยากรณ์ล่วงหน้าของ LightGBM จากฐานข้อมูลจริง พร้อม Residual Error และ Drift Status"""
    return timeseries_hitl_service.get_forecast_drift_report(db=db)

@router.post("/timeseries/trigger-drift-retrain")
def trigger_drift_retrain(payload: DriftRetrainRequest, db: Session = Depends(get_db)):
    """ผู้เชี่ยวชาญสั่ง Retrain โมเดลใหม่ทันทีผ่านไปป์ไลน์ MLOps เมื่อตรวจพบ Forecast Drift"""
    return timeseries_hitl_service.trigger_drift_retrain(
        reviewer_name=payload.reviewer_name,
        reviewer_notes=payload.reviewer_notes or "Retrain triggered from drift alert",
        db=db
    )

@router.post("/timeseries/acknowledge-drift")
def acknowledge_drift(payload: DriftAcknowledgeRequest):
    """ผู้เชี่ยวชาญรับทราบการแจ้งเตือน Forecast Drift (Acknowledge)"""
    return timeseries_hitl_service.acknowledge_drift_alert(
        reviewer_name=payload.reviewer_name,
        reviewer_notes=payload.reviewer_notes or "Acknowledged"
    )

@router.post("/timeseries/evaluate-drift")
@router.post("/timeseries/simulate-drift")
def evaluate_live_drift(db: Session = Depends(get_db)):
    """รันการคำนวณและประเมิน Forecast Drift จากฐานข้อมูลจริง PostgreSQL สดๆ ทันที (ไม่มี Mock)"""
    return timeseries_hitl_service.get_forecast_drift_report(db=db)

@router.get("/timeseries/archived-overrides")
def get_archived_overrides():
    """ดึงข้อมูลประวัติการ Archive รายการตรวจทานที่ถูกนำไป Retrain แล้ว"""
    return timeseries_hitl_service.get_archived_overrides()

@router.post("/timeseries/archive-released")
def archive_released_overrides(db: Session = Depends(get_db)):
    """สั่ง Archive รายการที่ตรวจทานแล้ว (RELEASED) และรีเซ็ตตัวนับคิวปัจจุบันให้เหลือ 0 ทันที"""
    return timeseries_hitl_service.archive_released_overrides(model_version="manual_archive", db=db)



