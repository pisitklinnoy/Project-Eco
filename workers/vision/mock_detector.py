"""
Mock Vision Detector (ตรวจวัดระดับน้ำจากภาพกล้อง CCTV)
ระหว่างที่เพื่อนกำลังพัฒนาโมเดลจริง โมดูลนี้ทำหน้าที่จำลองการอ่านระดับน้ำและค่าความมั่นใจ (Confidence)
"""

import random

class MockWaterlineDetector:
    def __init__(self, model_path: str = None):
        self.model_path = model_path
        print("[MockDetector] Loaded Mock Waterline Detector Engine")

    def detect_water_level(self, image_bytes: bytes, station_code: str = "STN-HY01") -> dict:
        """
        จำลองการตรวจวัดระดับน้ำจากภาพ:
        คืนค่า:
        - water_level (เมตร)
        - confidence (0.0 - 1.0)
        - is_valid (ผ่านเกณฑ์เบื้องต้นหรือไม่)
        """
        # สุ่มระดับน้ำช่วงปกติ - เตือนภัย 2.8 - 3.7 เมตร
        detected_level = round(random.uniform(2.80, 3.65), 2)
        confidence = round(random.uniform(0.85, 0.98), 2)
        
        return {
            "water_level": detected_level,
            "confidence": confidence,
            "is_valid": True,
            "detected_waterline_y_pixel": 420
        }

mock_detector = MockWaterlineDetector()
