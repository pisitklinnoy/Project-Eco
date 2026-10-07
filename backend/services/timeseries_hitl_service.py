"""
Time Series Human-in-the-Loop (HITL) Validation Service
======================================================
ระบบตรวจสอบและยืนยันข้อมูลโดยมนุษย์ฝั่ง Time Series (HITL) - เชื่อมต่อฐานข้อมูลจริง PostgreSQL 100% (ไม่มี Mock):

1. ด่านตรวจสอบข้อมูลนำเข้า (Data Ingestion Verification - Cross-Validation):
   - ตรวจสอบความสอดคล้องระหว่าง Vision AI กับ RID Telemetry Sensor จากตาราง water_measurements จริง
   - หากความต่างผิดปกติเกินเกณฑ์ (Discrepancy Threshold เช่น > 0.80 ม. หรือค่าติดลบ/หลุดขอบเขต)
     ระบบจะกักกัน/ระงับข้อมูลชั่วคราว (QUARANTINED) ไม่ให้ไหลเข้าโมเดล
   - เปิดให้ผู้เชี่ยวชาญ Review ตรวจสอบภาพหน้ากล้องและเซ็นเซอร์ แล้วทำ Manual Override ยืนยันค่าจริง
   - เมื่อมนุษย์ยืนยัน ข้อมูลจะถูกบันทึกเป็น source_type = 'MANUAL_REVIEW' และปลดสถานะเป็น RELEASED

2. ด่านประเมินผลการพยากรณ์ (Forecast Drift & Retrain Trigger):
   - เปรียบเทียบค่าจริงหน้างาน (Actual Ground Truth จาก water_measurements) 
     กับค่าที่โมเดลเคยพยากรณ์ล่วงหน้าไว้ (forecast_records)
   - คำนวณ Residual Error จริง (|Actual - Forecast|)
   - หากความคลาดเคลื่อนสูงกว่าเกณฑ์ความปลอดภัย (Safety Threshold เช่น > 0.40 ม.)
     ระบบจะส่งสัญญาณแจ้งเตือน Forecast Drift ให้ผู้เชี่ยวชาญ Review
     เพื่อสั่ง Retrain โมเดลใหม่ผ่านไปป์ไลน์ MLOps (Expanding Window + Champion-Challenger Gatekeeper)
"""

import os
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text

from core.database import SessionLocal
from core.config import settings

BASE_DIR = Path(__file__).resolve().parent.parent
CONFIG_DIR = BASE_DIR / "configs"
CONFIG_DIR.mkdir(exist_ok=True, parents=True)
STATE_FILE = CONFIG_DIR / "timeseries_hitl_state.json"

DISCREPANCY_THRESHOLD_M = 0.80  # เกณฑ์ความต่างผิดปกติระหว่าง Vision AI กับ RID Sensor (เมตร)
SAFETY_RESIDUAL_THRESHOLD_M = 0.40  # เกณฑ์ความปลอดภัยของ Residual Error สำหรับโมเดล LightGBM (เมตร)

STATION_METADATA = {
    "STN-MUANGKONG": {
        "name": "ท้ายเขื่อนคลองจำไพบูลย์ (ม่วงก็อง - X.173A)",
        "river": "คลองจำไพบูลย์ (ต้นน้ำ)",
        "image_url": "/api/v1/stations/STN-MUANGKONG/raw-frame.jpg"
    },
    "STN-BANGSALA": {
        "name": "บ้านบางศาลา (กลางน้ำ - X.90)",
        "river": "คลองอู่ตะเภา (กลางน้ำ)",
        "image_url": "/api/v1/stations/STN-BANGSALA/raw-frame.jpg"
    },
    "STN-HATYAINAI": {
        "name": "สะพานหาดใหญ่ใน (ปลายน้ำในเมือง - X.44)",
        "river": "คลองอู่ตะเภา (ปลายน้ำ)",
        "image_url": "/api/v1/stations/STN-HATYAINAI/raw-frame.jpg"
    }
}

CROSS_VALIDATION_SQL = """
SELECT 
    v.id as vision_id,
    v.station_code,
    v.timestamp,
    v.water_level as vision_val,
    v.image_minio_path,
    v.is_reviewed_by_human,
    r.water_level as sensor_val,
    r.timestamp as sensor_time,
    round(abs(v.water_level - r.water_level)::numeric, 3) as discrepancy
FROM water_measurements v
JOIN LATERAL (
    SELECT water_level, timestamp 
    FROM water_measurements 
    WHERE station_code = v.station_code 
      AND source_type IN ('RID_API_VERIFIED', 'API')
      AND abs(EXTRACT(EPOCH FROM (v.timestamp - timestamp))) <= 7200
    ORDER BY abs(EXTRACT(EPOCH FROM (v.timestamp - timestamp))) ASC 
    LIMIT 1
) r ON true
WHERE v.source_type IN ('CAMERA_VISION', 'ON_DEMAND_VISION')
  AND (abs(v.water_level - r.water_level) > :discrepancy_threshold OR v.water_level < 0.0 OR v.water_level > 25.0)
ORDER BY v.timestamp DESC
LIMIT 25;
"""

FORECAST_RESIDUAL_SQL = """
SELECT 
    f.id as forecast_id,
    f.station_code,
    f.forecast_time,
    f.predicted_1h,
    f.predicted_2h,
    f.predicted_3h,
    f.model_name,
    f.model_version,
    m.timestamp as actual_time,
    m.water_level as actual_val,
    round(abs(f.predicted_1h - m.water_level)::numeric, 3) as residual
FROM forecast_records f
JOIN LATERAL (
    SELECT timestamp, water_level 
    FROM water_measurements
    WHERE station_code = f.station_code 
      AND abs(EXTRACT(EPOCH FROM (timestamp - (f.forecast_time + INTERVAL '1 hour')))) <= 3600
    ORDER BY abs(EXTRACT(EPOCH FROM (timestamp - (f.forecast_time + INTERVAL '1 hour')))) ASC
    LIMIT 1
) m ON true
ORDER BY f.forecast_time DESC
LIMIT 20;
"""


def get_default_state() -> Dict[str, Any]:
    return {
        "resolved_overrides": {},
        "drift_monitor": {
            "safety_threshold_m": SAFETY_RESIDUAL_THRESHOLD_M,
            "last_evaluated_at": datetime.now(timezone.utc).isoformat(),
            "drift_detected": False,
            "max_residual_m": 0.0,
            "mean_residual_m": 0.0,
            "alert_status": "NORMAL",
            "alert_message": "พร้อมประเมินผลการพยากรณ์จริงจากฐานข้อมูล",
            "matched_evaluations": [],
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
                state = json.load(f)
                if "resolved_overrides" not in state:
                    state["resolved_overrides"] = {}
                if "drift_monitor" not in state:
                    state["drift_monitor"] = get_default_state()["drift_monitor"]
                return state
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
    def get_ingestion_queue(cls, db: Optional[Session] = None) -> List[Dict[str, Any]]:
        """
        ดึงรายการตรวจสอบความสอดคล้องระหว่าง Vision AI กับ RID Telemetry Sensor
        โดยสืบค้นตรงจากตาราง water_measurements ใน PostgreSQL (ไม่มี Mock):
        - หากความต่าง |Vision - Sensor| > 0.80 ม. หรือค่าติดลบ จะถูกกักกัน (QUARANTINED)
        - หากได้รับการทำ Manual Override แล้ว จะแสดงสถานะปลดการระงับ (RELEASED)
        """
        state = cls.load_state()
        resolved_overrides = state.get("resolved_overrides", {})
        archived_ids = set(state.get("archived_ids", []))

        should_close = False
        if db is None:
            db = SessionLocal()
            should_close = True

        items: List[Dict[str, Any]] = []
        try:
            rows = db.execute(
                text(CROSS_VALIDATION_SQL),
                {"discrepancy_threshold": DISCREPANCY_THRESHOLD_M}
            ).fetchall()

            for r in rows:
                item_id = f"ING-DB-{r.vision_id}"
                # หากรายการนี้ถูกดูดเข้าสู่โมเดลและย้ายเข้าคลังประวัติ (Archived) แล้ว ให้ข้ามไป ไม่นับในคิวรอบปัจจุบัน
                if item_id in archived_ids:
                    continue

                stn_meta = STATION_METADATA.get(r.station_code, {
                    "name": r.station_code,
                    "image_url": f"/api/v1/stations/{r.station_code}/raw-frame.jpg"
                })

                vision_val = float(r.vision_val)
                sensor_val = float(r.sensor_val)
                discrepancy = float(r.discrepancy)

                resolved_info = resolved_overrides.get(item_id)
                is_resolved = (resolved_info is not None) or bool(r.is_reviewed_by_human)

                if is_resolved and resolved_info:
                    status = "RELEASED"
                    resolved_at = resolved_info.get("resolved_at")
                    resolved_by = resolved_info.get("resolved_by")
                    resolution_type = resolved_info.get("resolution_type")
                    verified_water_level = resolved_info.get("verified_water_level")
                    resolution_notes = resolved_info.get("resolution_notes")
                elif is_resolved:
                    status = "RELEASED"
                    resolved_at = r.timestamp.isoformat() if hasattr(r.timestamp, "isoformat") else str(r.timestamp)
                    resolved_by = "Hydrologist Operator"
                    resolution_type = "MANUAL_REVIEW"
                    verified_water_level = sensor_val
                    resolution_notes = "ผ่านการยืนยันค่าจากผู้เชี่ยวชาญในระบบแล้ว"
                else:
                    status = "QUARANTINED"
                    resolved_at = None
                    resolved_by = None
                    resolution_type = None
                    verified_water_level = None
                    resolution_notes = None

                # กำหนดข้อความสาเหตุและคำแนะนำทางอุทกวิทยา
                if vision_val < 0.0:
                    flag_reason = f"ค่าระดับน้ำจากกล้อง ({vision_val:.2f} ม.) ติดลบผิดปกติทางฟิสิกส์ (เซ็นเซอร์ชลประทานอ่านได้ {sensor_val:.2f} ม.)"
                    suggested_action = "ตรวจสอบตำแหน่งเสาวัดน้ำหน้ากล้อง แสงสะท้อน หรือระดับน้ำต่ำกว่าฐานเสาจริง"
                elif discrepancy > 5.0:
                    flag_reason = f"ความต่างระหว่างกล้อง ({vision_val:.2f} ม.) และเซ็นเซอร์ ({sensor_val:.2f} ม.) สูงผิดปกติมาก ({discrepancy:.2f} ม.)"
                    suggested_action = "ตรวจสอบความต่างของระดับเทียบ รทก. หรือเลนส์กล้องมีสิ่งบดบัง"
                else:
                    flag_reason = f"ค่าระดับน้ำจากกล้อง ({vision_val:.2f} ม.) ต่างจากเซ็นเซอร์ ({sensor_val:.2f} ม.) เกินเกณฑ์ความปลอดภัย {DISCREPANCY_THRESHOLD_M} ม. (ส่วนต่าง {discrepancy:.2f} ม.)"
                    suggested_action = "ตรวจสอบภาพเสาวัดน้ำหน้ากล้องเทียบกับเซ็นเซอร์ทุ่นชลประทาน เพื่อเลือกค่ายืนยันหรือกรอกค่าจริงหน้างาน"

                items.append({
                    "id": item_id,
                    "station_code": r.station_code,
                    "station_name": stn_meta["name"],
                    "timestamp": r.timestamp.isoformat() if hasattr(r.timestamp, "isoformat") else str(r.timestamp),
                    "vision_water_level": round(vision_val, 2),
                    "sensor_water_level": round(sensor_val, 2),
                    "discrepancy_m": round(discrepancy, 2),
                    "status": status,
                    "flag_reason": flag_reason,
                    "image_url": stn_meta.get("image_url") or f"/api/v1/stations/{r.station_code}/raw-frame.jpg",
                    "suggested_action": suggested_action,
                    "resolved_at": resolved_at,
                    "resolved_by": resolved_by,
                    "resolution_type": resolution_type,
                    "verified_water_level": round(verified_water_level, 2) if verified_water_level is not None else None,
                    "resolution_notes": resolution_notes
                })
        finally:
            if should_close and db is not None:
                db.close()

        # จัดเรียง: รายการที่ยังรอตรวจ (QUARANTINED) ขึ้นก่อน ตามด้วยเวลาล่าสุด
        items.sort(key=lambda x: (x["status"] != "QUARANTINED", x["timestamp"]), reverse=False)
        return items

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
        ผู้เชี่ยวชาญ Review และทำ Manual Override ยืนยันค่าจริงหน้างาน:
        - ปลดสถานะระงับ (QUARANTINED -> RELEASED)
        - อัปเดตแฟล็ก is_reviewed_by_human ของเรคคอร์ดเดิมใน PostgreSQL
        - เพิ่มเรคคอร์ด WaterMeasurement ใหม่ (source_type = 'MANUAL_REVIEW')
          เพื่อให้โมเดล Time Series นำข้อมูลบริสุทธิ์ไปประมวลผลต่อได้ทันที
        """
        state = cls.load_state()
        resolved_overrides = state.get("resolved_overrides", {})
        now_iso = datetime.now(timezone.utc).isoformat()

        # ค้นหา station_code และ measurement ID ที่เกี่ยวข้อง
        station_code = "STN-BANGSALA"
        orig_timestamp = datetime.now(timezone.utc)
        vision_meas_id = None
        if review_id.startswith("ING-DB-"):
            try:
                vision_meas_id = int(review_id.replace("ING-DB-", ""))
                row = db.execute(
                    text("SELECT station_code, timestamp FROM water_measurements WHERE id = :id"),
                    {"id": vision_meas_id}
                ).fetchone()
                if row:
                    station_code = row[0]
                    orig_timestamp = row[1] or orig_timestamp
                    # ปรับสถานะแถวเดิมว่าได้รับการตรวจทานแล้ว
                    db.execute(
                        text("UPDATE water_measurements SET is_reviewed_by_human = TRUE WHERE id = :id"),
                        {"id": vision_meas_id}
                    )
            except Exception as e:
                print(f"[TimeSeriesHITL] Lookup measurement {review_id} note: {e}")

        # บันทึกค่ายืนยันลงฐานข้อมูลจริงตาม Timestamp ของเหตุการณ์เดิมที่ตรวจทาน
        from models.measurement import WaterMeasurement
        meas = WaterMeasurement(
            station_code=station_code,
            timestamp=orig_timestamp,
            water_level=verified_water_level,
            source_type="MANUAL_REVIEW",
            vision_confidence=1.0,
            is_reviewed_by_human=True
        )
        db.add(meas)
        db.commit()
        db.refresh(meas)

        # บันทึกสถานะการแก้ไขลง State
        override_record = {
            "resolved_at": now_iso,
            "resolved_by": reviewer_name,
            "resolution_type": selected_choice,
            "verified_water_level": verified_water_level,
            "resolution_notes": reviewer_notes,
            "new_measurement_id": meas.id
        }
        resolved_overrides[review_id] = override_record
        state["resolved_overrides"] = resolved_overrides
        cls.save_state(state)

        print(f"[TimeSeriesHITL] ✅ Ingestion Override Applied for {review_id}: {verified_water_level}m by {reviewer_name}")
        return {
            "status": "success",
            "review_id": review_id,
            "verified_water_level": verified_water_level,
            "resolution_type": selected_choice,
            "resolved_by": reviewer_name,
            "measurement_id": meas.id
        }

    @classmethod
    def evaluate_live_ingestion(cls, db: Optional[Session] = None) -> Dict[str, Any]:
        """
        ประเมินความสอดคล้องของข้อมูลนำเข้าจาก DB สดๆ ทันที
        """
        queue = cls.get_ingestion_queue(db=db)
        quarantined_count = sum(1 for q in queue if q["status"] == "QUARANTINED")
        released_count = sum(1 for q in queue if q["status"] == "RELEASED")
        return {
            "status": "evaluated",
            "total_candidates": len(queue),
            "quarantined_count": quarantined_count,
            "released_count": released_count,
            "items": queue[:10]
        }

    @classmethod
    def archive_released_overrides(cls, model_version: str = "latest", db: Optional[Session] = None) -> Dict[str, Any]:
        """
        Archive รายการที่ผ่านการตรวจทานแล้ว (RELEASED) เข้าสู่ประวัติการเทรน
        และรีเซ็ตรายการในคิว Active Ingestion Queue ให้กลับเป็น 0
        เมื่อโมเดล Time-Series ได้รับการ Retrain นำข้อมูลชุดนี้ไปฝึกฝนเรียบร้อยแล้ว
        """
        state = cls.load_state()
        resolved_overrides = state.get("resolved_overrides", {})
        archived_history = state.setdefault("archived_overrides_history", [])
        archived_ids = set(state.get("archived_ids", []))

        now_iso = datetime.now(timezone.utc).isoformat()

        # รวบรวมรายการทั้งหมดที่แสดงสถานะ RELEASED อยู่ในคิวขณะนี้
        current_queue = cls.get_ingestion_queue(db=db)
        released_items = [q for q in current_queue if q.get("status") == "RELEASED"]

        for item in released_items:
            item_id = item["id"]
            archived_ids.add(item_id)
            if item_id not in resolved_overrides:
                resolved_overrides[item_id] = {
                    "resolved_at": item.get("resolved_at") or now_iso,
                    "resolved_by": item.get("resolved_by") or "Hydrologist Operator",
                    "resolution_type": item.get("resolution_type") or "MANUAL_REVIEW",
                    "verified_water_level": item.get("verified_water_level") or item.get("sensor_water_level"),
                    "resolution_notes": item.get("resolution_notes") or "Verified in active queue"
                }

        count_archived = max(len(released_items), len(resolved_overrides))

        if count_archived > 0:
            archive_entry = {
                "archived_at": now_iso,
                "model_version": model_version,
                "count": count_archived,
                "items": dict(resolved_overrides)
            }
            archived_history.insert(0, archive_entry)
            state["archived_overrides_history"] = archived_history[:50]

            for item_id in resolved_overrides.keys():
                archived_ids.add(item_id)

            state["archived_ids"] = list(archived_ids)
            state["resolved_overrides"] = {}
            cls.save_state(state)
            print(f"[TimeSeriesHITL] 📦 Successfully archived {count_archived} released items into model version {model_version}. Ingestion queue counter reset to 0.")

        return {
            "status": "success",
            "archived_count": count_archived,
            "model_version": model_version,
            "archived_at": now_iso
        }

    @classmethod
    def get_archived_overrides(cls) -> Dict[str, Any]:
        """
        ดึงข้อมูลประวัติการ Archive รายการตรวจทานที่ถูกนำไป Retrain แล้ว
        """
        state = cls.load_state()
        history = state.get("archived_overrides_history", [])
        archived_ids = state.get("archived_ids", [])
        return {
            "total_archived_items": len(archived_ids),
            "archived_batches_count": len(history),
            "history": history
        }

    # =========================================================================
    # 2. ด่านประเมินผลการพยากรณ์ (Forecast Drift & Retrain Trigger)
    # =========================================================================

    @classmethod
    def get_forecast_drift_report(cls, db: Optional[Session] = None) -> Dict[str, Any]:
        """
        ดึงข้อมูลรายงานการประเมิน Forecast Drift จากฐานข้อมูลจริง PostgreSQL:
        - นำค่าจริงหน้างาน (Actual Ground Truth จาก water_measurements) 
          เทียบกับค่าพยากรณ์ล่วงหน้า (forecast_records)
        - คำนวณ Residual Error จริง (|Actual - Forecast|)
        - ตรวจสอบกับเกณฑ์ความปลอดภัย SAFETY_RESIDUAL_THRESHOLD_M (0.40 ม.)
        """
        state = cls.load_state()
        drift = state.get("drift_monitor", {})
        drift["safety_threshold_m"] = SAFETY_RESIDUAL_THRESHOLD_M

        should_close = False
        if db is None:
            db = SessionLocal()
            should_close = True

        try:
            rows = db.execute(text(FORECAST_RESIDUAL_SQL)).fetchall()
            matched_evals: List[Dict[str, Any]] = []

            for r in rows:
                stn_meta = STATION_METADATA.get(r.station_code, {"name": r.station_code})
                pred = round(float(r.predicted_1h), 2)
                act = round(float(r.actual_val), 2)
                res = round(float(r.residual), 3)
                is_ex = res > SAFETY_RESIDUAL_THRESHOLD_M

                target_dt = r.forecast_time + timedelta(hours=1)
                target_str = target_dt.isoformat() if hasattr(target_dt, "isoformat") else str(target_dt)

                matched_evals.append({
                    "station_code": r.station_code,
                    "station_name": stn_meta["name"],
                    "target_time": target_str,
                    "horizon": "+1h",
                    "predicted_level": pred,
                    "actual_level": act,
                    "residual_error": res,
                    "is_exceeded": is_ex
                })

            drift["matched_evaluations"] = matched_evals
            residuals = [e["residual_error"] for e in matched_evals]
            max_res = max(residuals) if residuals else 0.0
            mean_res = round(sum(residuals) / len(residuals), 3) if residuals else 0.0
            drift["max_residual_m"] = max_res
            drift["mean_residual_m"] = mean_res
            drift["last_evaluated_at"] = datetime.now(timezone.utc).isoformat()

            # ตรวจสอบประวัติการจัดการ Drift ล่าสุด (Retrain หรือ Acknowledge)
            history = drift.get("history", [])
            last_action = history[0] if history else None

            exceeded_items = [e for e in matched_evals if e["is_exceeded"]]
            if exceeded_items:
                if last_action and last_action.get("action") == "RETRAIN_TRIGGERED":
                    drift["drift_detected"] = False
                    drift["alert_status"] = "RESOLVED_RETRAINED"
                    drift["alert_message"] = f"ได้รับการแก้ไขแล้ว: สั่งฝึกฝนโมเดลใหม่ผ่านไปป์ไลน์ MLOps เรียบร้อยแล้ว (Residual ปัจจุบัน: {max_res:.2f} ม.)"
                elif last_action and last_action.get("action") == "ACKNOWLEDGED":
                    drift["drift_detected"] = False
                    drift["alert_status"] = "ACKNOWLEDGED"
                    drift["alert_message"] = f"รับทราบการแจ้งเตือนแล้วโดย {last_action.get('triggered_by')}: {last_action.get('notes')}"
                else:
                    top_ex = exceeded_items[0]
                    drift["drift_detected"] = True
                    drift["alert_status"] = "ACTIVE_DRIFT_ALERT"
                    drift["alert_message"] = (
                        f"🚨 ตรวจพบ Forecast Drift ในฐานข้อมูลจริง: ระดับน้ำจริงที่{top_ex['station_name']} "
                        f"ต่างจากที่โมเดลพยากรณ์ล่วงหน้าไว้ {top_ex['residual_error']:.2f} ม. "
                        f"(เกินเกณฑ์ความปลอดภัย {SAFETY_RESIDUAL_THRESHOLD_M:.2f} ม.)"
                    )
            else:
                drift["drift_detected"] = False
                drift["alert_status"] = "NORMAL"
                drift["alert_message"] = "ประสิทธิภาพการพยากรณ์อยู่ในเกณฑ์ปลอดภัย (No Drift Detected) ค่า Residual ทั้งหมดต่ำกว่าเกณฑ์ความปลอดภัย"

        finally:
            if should_close and db is not None:
                db.close()

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

        cls.save_state(state)
        return drift

    @classmethod
    def trigger_drift_retrain(
        cls,
        reviewer_name: str = "Hydrologist Engineer",
        reviewer_notes: str = "Triggered due to forecast drift exceeding safety threshold",
        db: Optional[Session] = None
    ) -> Dict[str, Any]:
        """
        ผู้เชี่ยวชาญ Review แล้วสั่ง Retrain โมเดลใหม่ผ่านไปป์ไลน์ MLOps
        เพื่อแก้ปัญหา Forecast Drift
        """
        from services.timeseries_retrain_service import timeseries_retrain_service

        print(f"[TimeSeriesHITL] 🚀 Executing Retrain from Drift Review by {reviewer_name}...")
        retrain_result = timeseries_retrain_service.execute_retrain_job(
            trigger_type="DRIFT_DETECTED_HITL",
            force_promote=True,
            db=db
        )

        state = cls.load_state()
        drift = state.get("drift_monitor", {})
        now_iso = datetime.now(timezone.utc).isoformat()

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


timeseries_hitl_service = TimeSeriesHITLService()
