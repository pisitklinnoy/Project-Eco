"""
Human-in-the-Loop (HITL) Service Modules
========================================
สถาปัตยกรรมการมีมนุษย์ร่วมในกระบวนการตัดสินใจ (Human-in-the-Loop) 3 ส่วนหลัก:
1. SensorAnomalyReviewer : มนุษย์ตรวจทานและ Override ค่าเซ็นเซอร์ที่ผิดปกติก่อนเข้าโมเดล
2. WhatIfGateSimulator    : มนุษย์จำลองการเปิด-ปิดประตูระบายน้ำคลอง ร.1 และดูผลกระทบทันที
3. AlertSignoffManager    : มนุษย์ (ผู้มีอำนาจ) อนุมัติตรวจทานสัญญาณเตือนภัยก่อนกระจายสู่ประชาชน
"""

from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
import copy


class SensorAnomalyReviewer:
    """
    1. ตรวจสอบความผิดปกติของเซ็นเซอร์ และเปิดให้คน Override ข้อมูลจริงหน้างาน
    """

    MAX_HOURLY_RATE_OF_RISE = 1.20  # ถ้าระดับน้ำกระโดดเกิน 1.2 เมตร/ชม. ถือว่าผิดธรรมชาติ

    @classmethod
    def check_telemetry_anomaly(cls, current_val: float, previous_val: float, rain_amount: float) -> Dict[str, Any]:
        delta = abs(current_val - previous_val)
        is_suspicious = False
        reasons = []

        if delta > cls.MAX_HOURLY_RATE_OF_RISE and rain_amount < 20.0:
            is_suspicious = True
            reasons.append(f"ระดับน้ำเปลี่ยนเร็วผิดปกติ ({delta:.2f} ม./ชม.) โดยไม่มีฝนหนัก")

        if current_val <= 0 or current_val > 25.0:
            is_suspicious = True
            reasons.append(f"ระดับน้ำหลุดช่วงที่เป็นไปได้ทางกายภาพ ({current_val:.2f} ม.)")

        return {
            "is_suspicious": is_suspicious,
            "anomaly_reasons": reasons,
            "rate_of_change_m": round(delta, 3),
            "requires_human_verification": is_suspicious
        }

    @classmethod
    def apply_manual_override(cls, raw_measurement: Dict[str, Any], corrected_level: float, reviewer_name: str, notes: str) -> Dict[str, Any]:
        """
        บันทึกการแก้ไขค่าระดับน้ำจากมนุษย์ และเปลี่ยนสถานะเป็น MANUAL_REVIEW
        """
        reviewed = copy.deepcopy(raw_measurement)
        reviewed["original_water_level"] = raw_measurement.get("water_level")
        reviewed["water_level"] = corrected_level
        reviewed["source_type"] = "MANUAL_REVIEW"
        reviewed["is_reviewed_by_human"] = True
        reviewed["reviewed_by"] = reviewer_name
        reviewed["reviewer_notes"] = notes
        reviewed["reviewed_at"] = datetime.now(timezone.utc).isoformat()
        return reviewed


class WhatIfGateSimulator:
    """
    2. Interactive Sandbox จำลองการเปิด-ปิดประตูระบายน้ำคลอง ร.1 (คลองภูมินาถดำริ)
    """

    @classmethod
    def simulate_gate_operation(cls, base_forecast: Dict[str, Any], gate_r1_open_percent: float, rain_surge_mm: float = 0.0) -> Dict[str, Any]:
        """
        คำนวณการผันน้ำตัดยอดน้ำเข้าคลอง ร.1:
        - คลอง ร.1 มีศักยภาพผันน้ำสูงสุด ~465 ลบ.ม./วินาที
        - ทุก 10% ของการเปิดประตูระบายน้ำคลอง ร.1 จะช่วยตัดทอนระดับน้ำที่ปลายน้ำหาดใหญ่ใน (X.44) ได้ประมาณ 0.08 - 0.12 เมตร
        """
        gate_open = max(0.0, min(100.0, float(gate_r1_open_percent)))
        rain_surge = max(0.0, float(rain_surge_mm))

        simulated = copy.deepcopy(base_forecast)
        simulated["simulation_mode"] = True
        simulated["gate_r1_open_percent"] = gate_open
        simulated["rain_surge_mm"] = rain_surge

        # ปรับค่าเฉพาะสถานีปลายน้ำหาดใหญ่ใน (X.44) และกลางน้ำ (X.90)
        is_hatyai = (base_forecast.get("station_id") == 2 or base_forecast.get("rid_code") == "X.44")
        
        for pred in simulated["predictions"]:
            h = pred["horizon_hours"]
            orig_level = pred["predicted_level"]

            # อิทธิพลจากการเปิดประตูคลอง ร.1 (ส่งผลชัดเจนในชั่วโมงที่ 2 และ 3)
            gate_reduction = (gate_open / 100.0) * (0.10 * h) if is_hatyai else (gate_open / 100.0) * (0.03 * h)
            # อิทธิพลจากฝนตกเพิ่ม
            rain_increase = (rain_surge * 0.015) * (0.5 * h)

            new_level = round(orig_level - gate_reduction + rain_increase, 3)
            pred["predicted_level"] = new_level
            pred["simulated_gate_reduction_m"] = round(gate_reduction, 3)
            pred["simulated_rain_increase_m"] = round(rain_increase, 3)

            # อัปเดตสถานะความเสี่ยงตามค่าจำลองใหม่
            crit = simulated["critical_threshold"]
            warn = simulated["warning_threshold"]
            if new_level >= crit:
                pred["severity"] = "CRITICAL"
                pred["status_color"] = "red"
            elif new_level >= warn:
                pred["severity"] = "WARNING"
                pred["status_color"] = "orange"
            else:
                pred["severity"] = "NORMAL"
                pred["status_color"] = "green"

        return simulated


class AlertSignoffManager:
    """
    3. ระบบตรวจทานและอนุมัติการแจ้งเตือนภัย (Decision Support Sign-Off)
    ป้องกัน False Alarm ก่อนส่งข้อความสู่ประชาชน
    """

    @classmethod
    def create_alert_draft(cls, forecast_result: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        ตรวจหาว่ามีช่วงเวลาใดใน 1-3 ชม. ข้างหน้าที่ระดับน้ำเกินเกณฑ์เตือนภัยหรือไม่
        """
        highest_severity = "NORMAL"
        trigger_horizon = None
        trigger_level = None

        for pred in forecast_result["predictions"]:
            if pred["severity"] == "CRITICAL":
                highest_severity = "CRITICAL"
                trigger_horizon = pred["horizon_hours"]
                trigger_level = pred["predicted_level"]
                break
            elif pred["severity"] == "WARNING" and highest_severity != "CRITICAL":
                highest_severity = "WARNING"
                trigger_horizon = pred["horizon_hours"]
                trigger_level = pred["predicted_level"]

        if highest_severity == "NORMAL":
            return None

        station_name = forecast_result["station_name"]
        draft_msg = (
            f"⚠️ [แจ้งเตือนภัยน้ำท่วม - {highest_severity}] บริเวณ {station_name}: "
            f"AI พยากรณ์ว่าระดับน้ำจะแตะ {trigger_level:.2f} ม. ภายในอีก {trigger_horizon} ชั่วโมงข้างหน้า "
            f"(เกณฑ์เฝ้าระวัง: {forecast_result['warning_threshold']:.2f} ม., วิกฤติ: {forecast_result['critical_threshold']:.2f} ม.)"
        )

        return {
            "status": "PENDING_HUMAN_APPROVAL",
            "station_code": forecast_result["ecosystem_code"],
            "severity": highest_severity,
            "trigger_horizon_h": trigger_horizon,
            "trigger_level_m": trigger_level,
            "draft_message": draft_msg,
            "created_at": datetime.now(timezone.utc).isoformat()
        }

    @classmethod
    def commander_signoff(cls, alert_draft: Dict[str, Any], action: str, commander_name: str, comment: str) -> Dict[str, Any]:
        """
        action: 'APPROVE_AND_BROADCAST' หรือ 'DOWNGRADE' หรือ 'DISMISS'
        """
        decision = copy.deepcopy(alert_draft)
        decision["decision_action"] = action
        decision["decided_by"] = commander_name
        decision["commander_comment"] = comment
        decision["decision_timestamp"] = datetime.now(timezone.utc).isoformat()
        decision["is_broadcasted"] = (action == "APPROVE_AND_BROADCAST")
        decision["status"] = "APPROVED" if action == "APPROVE_AND_BROADCAST" else "REJECTED_OR_MODIFIED"
        return decision
