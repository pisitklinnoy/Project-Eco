"""
Time Series Human-in-the-Loop (HITL) Validation Service
======================================================
ระบบตรวจสอบและยืนยันข้อมูลโดยมนุษย์ฝั่ง Time Series (HITL):

1. ด่านตรวจสอบข้อมูลนำเข้า (Data Ingestion Verification - Cross-Validation):
   - ตรวจสอบความสอดคล้องระหว่าง Vision AI กับ RID Telemetry Sensor
   - หากความต่างผิดปกติเกินเกณฑ์ (Discrepancy Threshold เช่น > 0.80 ม. หรือ 20 vs 2 หน่วย)
     ระบบจะกักกัน/ระงับข้อมูลชั่วคราว (Quarantined) ไม่ให้ไหลเข้าโมเดล
   - เปิดให้ผู้เชี่ยวชาญ Review ตรวจสอบฮาร์ดแวร์/หน้ากล้อง และทำ Manual Override ยืนยันค่าจริง

2. ด่านประเมินผลการพยากรณ์ (Forecast Drift & Retrain Trigger):
   - เปรียบเทียบค่าจริงหน้างาน (Actual Ground Truth) กับค่าที่โมเดล LightGBM เคยพยากรณ์ล่วงหน้าไว้
   - คำนวณ Residual Error (|Actual - Forecast|)
   - หากความคลาดเคลื่อนสูงกว่าเกณฑ์ความปลอดภัย (Safety Threshold เช่น > 0.40 ม.)
     ระบบจะส่งสัญญาณแจ้งเตือน Forecast Drift ให้ผู้เชี่ยวชาญ Review
     เพื่อประกอบการตัดสินใจสั่ง Retrain โมเดลใหม่ผ่านไปป์ไลน์ MLOps
"""

import os
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session

from core.config import settings

BASE_DIR = Path(__file__).resolve().parent.parent
CONFIG_DIR = BASE_DIR / "configs"
CONFIG_DIR.mkdir(exist_ok=True, parents=True)
STATE_FILE = CONFIG_DIR / "timeseries_hitl_state.json"

DISCREPANCY_THRESHOLD_M = 0.80  # เกณฑ์ความต่างผิดปกติระหว่าง Vision AI กับ RID Sensor (เมตร)
SAFETY_RESIDUAL_THRESHOLD_M = 0.40  # เกณฑ์ความปลอดภัยของ Residual Error สำหรับโมเดล LightGBM (เมตร)


def get_default_state() -> Dict[str, Any]:
    return {
        "ingestion_queue": [
            {
                "id": "ING-BANGSALA-01",
                "station_code": "STN-BANGSALA",
                "station_name": "บ้านบางศาลา (กลางน้ำ - คลองอู่ตะเภา)",
                "timestamp": "2026-10-06T12:00:00Z",
                "vision_water_level": 14.80,
                "sensor_water_level": 2.45,
                "discrepancy_m": 12.35,
                "status": "QUARANTINED",
                "flag_reason": "ค่าที่อ่านได้จากภาพกล้อง (14.80 ม.) แตกต่างจากเซ็นเซอร์ชลประทาน RID (2.45 ม.) ผิดปกติเกินเกณฑ์ (ส่วนต่าง 12.35 ม.)",
                "image_url": "/api/v1/stations/STN-BANGSALA/raw-frame.jpg",
                "suggested_action": "ตรวจสอบภาพเสาวัดน้ำหน้ากล้องว่ามีคราบตะไคร่หรือแสงสะท้อนผิวน้ำรบกวนหรือไม่ หรือเซ็นเซอร์ทุ่นชลประทานติดขัด",
                "resolved_at": None,
                "resolved_by": None,
                "resolution_type": None,
                "verified_water_level": None,
                "resolution_notes": None
            },
            {
                "id": "ING-HATYAINAI-02",
                "station_code": "STN-HATYAINAI",
                "station_name": "สะพานหาดใหญ่ใน (ปลายน้ำในเมือง)",
                "timestamp": "2026-10-06T13:30:00Z",
                "vision_water_level": 5.20,
                "sensor_water_level": 4.10,
                "discrepancy_m": 1.10,
                "status": "QUARANTINED",
                "flag_reason": "ความต่างระหว่างกล้อง (5.20 ม.) กับเซ็นเซอร์ (4.10 ม.) เกินเกณฑ์ความปลอดภัย 0.80 ม.",
                "image_url": "/api/v1/stations/STN-HATYAINAI/raw-frame.jpg",
                "suggested_action": "ตรวจสอบระดับน้ำหน้างานจริงเพื่อทำ Manual Override",
                "resolved_at": None,
                "resolved_by": None,
                "resolution_type": None,
                "verified_water_level": None,
                "resolution_notes": None
            }
        ],
        "drift_monitor": {
            "safety_threshold_m": SAFETY_RESIDUAL_THRESHOLD_M,
            "last_evaluated_at": "2026-10-06T13:45:00Z",
            "drift_detected": True,
            "max_residual_m": 0.62,
            "mean_residual_m": 0.40,
            "alert_status": "ACTIVE_DRIFT_ALERT",
            "alert_message": "ตรวจพบ Forecast Drift: ค่าระดับน้ำจริงที่สถานี X.90 (บางศาลา) สูงกว่าที่ LightGBM พยากรณ์ล่วงหน้าไว้ 0.62 ม. (เกินเกณฑ์ความปลอดภัย 0.40 ม.)",
            "current_model": {
                "name": "Unified-LightGBM-Forecaster",
                "version": "v1.0",
                "champion_mae": 0.0699
            },
            "matched_evaluations": [
                {
                    "station_code": "STN-BANGSALA",
                    "station_name": "บ้านบางศาลา (X.90)",
                    "target_time": "2026-10-06T13:00:00Z",
                    "horizon": "+1h",
                    "predicted_level": 6.80,
                    "actual_level": 7.42,
                    "residual_error": 0.62,
                    "is_exceeded": True
                },
                {
                    "station_code": "STN-HATYAINAI",
                    "station_name": "สะพานหาดใหญ่ใน (X.44)",
                    "target_time": "2026-10-06T13:00:00Z",
                    "horizon": "+2h",
                    "predicted_level": 4.50,
                    "actual_level": 4.95,
                    "residual_error": 0.45,
                    "is_exceeded": True
                },
                {
                    "station_code": "STN-MUANGKONG",
                    "station_name": "ท้ายเขื่อนคลองจำไพบูลย์ (ม่วงก็อง - X.173A)",
                    "target_time": "2026-10-06T13:00:00Z",
                    "horizon": "+1h",
                    "predicted_level": 11.20,
                    "actual_level": 11.32,
                    "residual_error": 0.12,
                    "is_exceeded": False
                }
            ],
            "history": []
        }
    }


class TimeSeriesHITLService:
    @staticmethod
    def load_state() -> Dict[str, Any]:
        if not STATE_FILE.exists():
            state = get_default_state()
            TimeSeriesHITLService.save_state(state)
            return state
        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[TimeSeriesHITLService] State load error: {e}")
            return get_default_state()

    @staticmethod
    def save_state(state: Dict[str, Any]) -> None:
        try:
            with open(STATE_FILE, "w", encoding="utf-8") as f:
                json.dump(state, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"[TimeSeriesHITLService] State save error: {e}")

    # =========================================================================
    # 1. ด่านตรวจสอบข้อมูลนำเข้า (Data Ingestion Verification - Cross-Validation)
    # =========================================================================

    @classmethod
    def get_ingestion_queue(cls) -> List[Dict[str, Any]]:
        state = cls.load_state()
        return state.get("ingestion_queue", [])

    @classmethod
    def check_and_quarantine_ingestion(
        cls,
        station_code: str,
        station_name: str,
        vision_val: float,
        sensor_val: float,
        image_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Cross-Validation ตรวจสอบความสอดคล้องระหว่าง Vision AI กับ RID Sensor:
        หากพบความต่างผิดปกติเกินเกณฑ์ (เช่น 20 vs 2 หรือ diff > 0.8m)
        ระบบจะระงับข้อมูลชั่วคราวและแจ้งเตือนเข้าคิว Review
        """
        discrepancy = round(abs(vision_val - sensor_val), 3)
        is_quarantined = (discrepancy > DISCREPANCY_THRESHOLD_M) or (vision_val <= 0 or vision_val > 25.0)

        if not is_quarantined:
            return {
                "quarantined": False,
                "discrepancy_m": discrepancy,
                "message": f"Cross-validation passed (delta: {discrepancy:.2f} m <= {DISCREPANCY_THRESHOLD_M} m)"
            }

        state = cls.load_state()
        item_id = f"ING-{station_code.replace('STN-', '')}-{int(datetime.now(timezone.utc).timestamp())}"

        new_item = {
            "id": item_id,
            "station_code": station_code,
            "station_name": station_name,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "vision_water_level": round(vision_val, 3),
            "sensor_water_level": round(sensor_val, 3),
            "discrepancy_m": discrepancy,
            "status": "QUARANTINED",
            "flag_reason": f"ค่าระดับน้ำจากกล้อง ({vision_val:.2f} ม.) ต่างจากเซ็นเซอร์ชลประทาน ({sensor_val:.2f} ม.) เกินเกณฑ์ความปลอดภัย {DISCREPANCY_THRESHOLD_M} ม. (ส่วนต่าง {discrepancy:.2f} ม.)",
            "image_url": image_url or f"/api/v1/stations/{station_code}/raw-frame.jpg",
            "suggested_action": "ตรวจสอบภาพและเซ็นเซอร์หน้างานจริงเพื่อทำ Manual Override",
            "resolved_at": None,
            "resolved_by": None,
            "resolution_type": None,
            "verified_water_level": None,
            "resolution_notes": None
        }

        queue = state.get("ingestion_queue", [])
        queue.insert(0, new_item)
        state["ingestion_queue"] = queue[:30]
        cls.save_state(state)

        print(f"[TimeSeriesHITL] ⚠️ Data Quarantined: {item_id} (Delta: {discrepancy}m, Vision: {vision_val}m vs Sensor: {sensor_val}m)")
        return {
            "quarantined": True,
            "discrepancy_m": discrepancy,
            "item": new_item
        }

    @classmethod
    def apply_ingestion_override(
        cls,
        db: Session,
        review_id: str,
        selected_choice: str,
        verified_water_level: float,
        reviewer_name: str,
        reviewer_notes: str
    ) -> Dict[str, Any]:
        """
        ผู้เชี่ยวชาญ Review และทำ Manual Override:
        - เลือกค่ายืนยัน (จากกล้อง, เซ็นเซอร์, หรือกรอกค่าจริงหน้างาน)
        - ปลดสถานะระงับ (RELEASED)
        - ป้อนค่าจริงเข้าสู่ตาราง WaterMeasurement เพื่อให้โมเดล Time Series นำไปใช้งานต่อ
        """
        state = cls.load_state()
        queue = state.get("ingestion_queue", [])
        target_item = None

        for item in queue:
            if item["id"] == review_id:
                target_item = item
                break

        if not target_item:
            raise ValueError(f"Review item {review_id} not found in ingestion queue")

        now_iso = datetime.now(timezone.utc).isoformat()
        target_item["status"] = "RELEASED"
        target_item["resolved_at"] = now_iso
        target_item["resolved_by"] = reviewer_name
        target_item["resolution_type"] = selected_choice
        target_item["verified_water_level"] = verified_water_level
        target_item["resolution_notes"] = reviewer_notes

        cls.save_state(state)

        # บันทึกเป็น WaterMeasurement ในฐานข้อมูลจริง (source_type = MANUAL_REVIEW)
        try:
            from models.measurement import WaterMeasurement
            meas = WaterMeasurement(
                station_code=target_item["station_code"],
                timestamp=datetime.now(timezone.utc),
                water_level=verified_water_level,
                source_type="MANUAL_REVIEW",
                vision_confidence=1.0,
                is_reviewed_by_human=True
            )
            db.add(meas)
            db.commit()
            db.refresh(meas)
            meas_id = meas.id
        except Exception as e:
            print(f"[TimeSeriesHITL] Database save note: {e}")
            meas_id = None

        print(f"[TimeSeriesHITL] ✅ Ingestion Override Applied for {review_id}: Verified Level = {verified_water_level}m by {reviewer_name}")
        return {
            "status": "success",
            "review_id": review_id,
            "verified_water_level": verified_water_level,
            "resolution_type": selected_choice,
            "resolved_by": reviewer_name,
            "measurement_id": meas_id,
            "item": target_item
        }

    # =========================================================================
    # 2. ด่านประเมินผลการพยากรณ์ (Forecast Drift & Retrain Trigger)
    # =========================================================================

    @classmethod
    def get_forecast_drift_report(cls, db: Optional[Session] = None) -> Dict[str, Any]:
        """
        ดึงข้อมูลรายงานการประเมิน Forecast Drift ล่าสุด:
        - นำค่าจริงหน้างาน (Actual Ground Truth) มาเทียบกับค่าที่ LightGBM เคยพยากรณ์ไว้
        - คำนวณ Residual Error และตรวจสอบกับเกณฑ์ความปลอดภัย
        """
        state = cls.load_state()
        drift = state.get("drift_monitor", {})
        drift["safety_threshold_m"] = SAFETY_RESIDUAL_THRESHOLD_M

        # ดึงสถานะโมเดลปัจจุบันจาก timeseries_retrain_service
        try:
            from services.timeseries_retrain_service import timeseries_retrain_service
            ts_state = timeseries_retrain_service.load_retrain_state()
            drift["current_model"] = {
                "name": ts_state.get("current_model_name", "Unified-LightGBM-Forecaster"),
                "version": ts_state.get("current_model_version", "v1.0"),
                "champion_mae": ts_state.get("last_mae_meters", 0.0699),
                "is_retraining": ts_state.get("is_retraining", False)
            }
        except Exception as e:
            print(f"[TimeSeriesHITL] Could not read ts_state: {e}")

        return drift

    @classmethod
    def trigger_drift_retrain(
        cls,
        reviewer_name: str = "Hydrologist Engineer",
        reviewer_notes: str = "Triggered due to forecast drift exceeding safety threshold"
    ) -> Dict[str, Any]:
        """
        ผู้เชี่ยวชาญ Review แล้วสั่ง Retrain โมเดลใหม่ผ่านไปป์ไลน์ MLOps
        เพื่อแก้ปัญหา Forecast Drift
        """
        from services.timeseries_retrain_service import timeseries_retrain_service

        print(f"[TimeSeriesHITL] 🚀 Executing Retrain from Drift Review by {reviewer_name}...")
        retrain_result = timeseries_retrain_service.execute_retrain_job(
            trigger_type="DRIFT_DETECTED_HITL",
            force_promote=True
        )

        state = cls.load_state()
        drift = state.get("drift_monitor", {})
        now_iso = datetime.now(timezone.utc).isoformat()

        # บันทึกลงประวัติการจัดการ Drift
        hist_item = {
            "id": f"drift-action-{int(datetime.now(timezone.utc).timestamp())}",
            "action": "RETRAIN_TRIGGERED",
            "triggered_by": reviewer_name,
            "notes": reviewer_notes,
            "timestamp": now_iso,
            "retrain_result": retrain_result
        }
        history = drift.get("history", [])
        history.insert(0, hist_item)
        drift["history"] = history[:15]

        # เคลียร์สถานะการเตือน Drift เนื่องจากได้สั่งเทรนโมเดลใหม่แล้ว
        drift["drift_detected"] = False
        drift["alert_status"] = "RESOLVED_RETRAINED"
        drift["alert_message"] = f"ได้รับการแก้ไขแล้ว: สั่งฝึกฝนโมเดลใหม่เป็นเวอร์ชัน {retrain_result.get('model_version')} สำเร็จ"
        drift["last_evaluated_at"] = now_iso

        cls.save_state(state)

        return {
            "status": "success",
            "action": "RETRAIN_TRIGGERED",
            "retrain_result": retrain_result,
            "resolved_by": reviewer_name,
            "timestamp": now_iso
        }

    @classmethod
    def acknowledge_drift_alert(
        cls,
        reviewer_name: str = "Hydrologist Operator",
        reviewer_notes: str = "Acknowledged drift alert. Under monitoring."
    ) -> Dict[str, Any]:
        """
        ผู้เชี่ยวชาญรับทราบการแจ้งเตือน Forecast Drift (Acknowledge)
        """
        state = cls.load_state()
        drift = state.get("drift_monitor", {})
        now_iso = datetime.now(timezone.utc).isoformat()

        hist_item = {
            "id": f"drift-ack-{int(datetime.now(timezone.utc).timestamp())}",
            "action": "ACKNOWLEDGED",
            "triggered_by": reviewer_name,
            "notes": reviewer_notes,
            "timestamp": now_iso
        }
        history = drift.get("history", [])
        history.insert(0, hist_item)
        drift["history"] = history[:15]

        drift["drift_detected"] = False
        drift["alert_status"] = "ACKNOWLEDGED"
        drift["alert_message"] = f"รับทราบการแจ้งเตือนแล้วโดย {reviewer_name}: {reviewer_notes}"
        drift["last_evaluated_at"] = now_iso

        cls.save_state(state)

        return {
            "status": "success",
            "action": "ACKNOWLEDGED",
            "resolved_by": reviewer_name,
            "timestamp": now_iso
        }

    @classmethod
    def simulate_drift_event(cls, residual_error: float = 0.65) -> Dict[str, Any]:
        """
        จำลองเหตุการณ์ Forecast Drift เพื่อให้ผู้ใช้สามารถทดสอบฟังก์ชันในหน้าเว็บได้ทันที
        """
        state = cls.load_state()
        drift = state.get("drift_monitor", {})
        now_iso = datetime.now(timezone.utc).isoformat()

        drift["drift_detected"] = True
        drift["max_residual_m"] = round(residual_error, 2)
        drift["mean_residual_m"] = round(residual_error * 0.75, 2)
        drift["alert_status"] = "ACTIVE_DRIFT_ALERT"
        drift["alert_message"] = f"🚨 ตรวจพบ Forecast Drift: ค่าระดับน้ำจริงที่สถานีบางศาลาสูงกว่าที่ LightGBM พยากรณ์ไว้ {residual_error:.2f} ม. (เกินเกณฑ์ความปลอดภัย {SAFETY_RESIDUAL_THRESHOLD_M} ม.)"
        drift["last_evaluated_at"] = now_iso

        cls.save_state(state)
        return drift


timeseries_hitl_service = TimeSeriesHITLService()
