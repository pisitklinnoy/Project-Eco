"""
Mock Time-Series Forecast Engine
จำลองการพยากรณ์ระดับน้ำล่วงหน้า 1, 2, และ 3 ชั่วโมง
"""

import random

class MockFloodForecaster:
    def __init__(self, model_path: str = None):
        self.model_path = model_path
        print("[MockForecaster] Loaded Mock Time-Series Flood Forecasting Engine")

    def predict_next_hours(self, current_water_level: float, recent_rain_1h: float) -> dict:
        """
        พยากรณ์ระดับน้ำล่วงหน้า:
        สมการจำลอง: หากฝนตกหนัก ระดับน้ำมีแนวโน้มเพิ่มขึ้นตามอัตราส่วน
        """
        # อิทธิพลจากปริมาณฝน (Rainfall Runoff Factor)
        rain_impact = (recent_rain_1h / 50.0) * 0.4
        
        # เพิ่ม delta สอดคล้องกับแนวโน้มน้ำท่วมหาดใหญ่
        trend = random.uniform(0.05, 0.15) + rain_impact
        
        p1 = round(current_water_level + trend, 2)
        p2 = round(current_water_level + (trend * 1.8), 2)
        p3 = round(current_water_level + (trend * 2.4), 2)

        return {
            "predicted_1h": p1,
            "predicted_2h": p2,
            "predicted_3h": p3,
            "model_name": "Mock-Flood-Forecaster-v1",
            "model_version": "1.0-mock"
        }

mock_forecaster = MockFloodForecaster()
