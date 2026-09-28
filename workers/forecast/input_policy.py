"""
Input Policy Module
ตรวจสอบความสด ความสมบูรณ์ และความถูกต้องของข้อมูลก่อนส่งเข้าโมเดลพยากรณ์
"""

from datetime import datetime, timedelta

class InputPolicy:
    MAX_IMAGE_AGE_MINUTES = 30
    MAX_API_AGE_MINUTES = 20

    @classmethod
    def determine_mode(cls, latest_api_measurement: dict, latest_camera_measurement: dict) -> dict:
        now = datetime.utcnow()
        
        has_fresh_api = False
        has_fresh_camera = False

        if latest_api_measurement:
            age = (now - latest_api_measurement["timestamp"]).total_seconds() / 60.0
            if age <= cls.MAX_API_AGE_MINUTES:
                has_fresh_api = True

        if latest_camera_measurement and latest_camera_measurement.get("quality_passed", False):
            age = (now - latest_camera_measurement["timestamp"]).total_seconds() / 60.0
            if age <= cls.MAX_IMAGE_AGE_MINUTES:
                has_fresh_camera = True

        if has_fresh_api and has_fresh_camera:
            return {
                "can_forecast": True,
                "mode": "API_PLUS_VISION",
                "water_level": (latest_api_measurement["water_level"] + latest_camera_measurement["water_level"]) / 2.0,
                "quality_status": "HIGH_CONFIDENCE"
            }
        elif has_fresh_api:
            return {
                "can_forecast": True,
                "mode": "API_ONLY",
                "water_level": latest_api_measurement["water_level"],
                "quality_status": "MEDIUM_CONFIDENCE_API_FALLBACK"
            }
        else:
            return {
                "can_forecast": False,
                "mode": "INSUFFICIENT_DATA",
                "water_level": None,
                "quality_status": "DATA_STALE_CANNOT_PREDICT"
            }
