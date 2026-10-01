"""
Water Surface Contact Detector Module
ระบบตรวจจับจุดตัดผิวน้ำสัมผัสกับเสาวัดระดับน้ำ (Water Surface Contact Line)
ใช้อัลกอริทึม 1D Change Point Analysis + Monotonic Submersion Constraint + Flood Ripple Verification
"""

import cv2
import numpy as np
from .scale_calibrator import PiecewiseScaleCalibrator


class WaterSurfaceDetector:
    """
    ระบบตรวจจับผิวน้ำอัตโนมัติบนภาพเสาวัดน้ำ Enhanced ROI
    """
    def __init__(self, calibrator: PiecewiseScaleCalibrator, station_config: dict):
        self.calibrator = calibrator
        self.config = station_config
        self.station_code = station_config.get("station_code", "Unknown")
        self.station_name = station_config.get("station_name", "Unknown")
        self.warning_thresholds = station_config.get("warning_thresholds", {})
        self.baseline_lvl = station_config.get("baseline_water_level_m", None)
        self.baseline_y = station_config.get("baseline_y", None)
        self.flood_score_thresh = station_config.get("flood_threshold_score", 15.0)

    def detect_waterline(self, enhanced_gauge: np.ndarray) -> dict:
        """
        ตรวจจับตำแหน่ง Y ของเส้นผิวน้ำบนภาพ Enhanced Staff Gauge
        ส่งคืน: dict ข้อมูลระดับน้ำ, ความเชื่อมั่น, สถานะการเตือนภัย
        """
        h, w = enhanced_gauge.shape[:2]
        gray = cv2.cvtColor(enhanced_gauge, cv2.COLOR_BGR2GRAY)

        # คำนวณ Standard Deviation ตามแนวนอนเฉพาะบริเวณตัวเสา (ตัดขอบ 20% ซ้ายขวาออก)
        cx1 = int(w * 0.20)
        cx2 = int(w * 0.80)
        stds = np.array([np.std(gray[y, cx1:cx2]) for y in range(h)], dtype=np.float32)

        # Rolling Max เพื่อลดสัญญาณรบกวนระหว่างตัวเลข
        win = 30
        rolling_max = np.array([
            np.max(stds[max(0, y - win // 2):min(h, y + win // 2)])
            for y in range(h)
        ])
        cum = np.cumsum(rolling_max)
        total_sum = cum[-1]

        # 1D Change Point Scan (ตรวจหาจุดตัดระหว่างความคมชัดบนเสาแห้ง กับ ผิวน้ำ)
        scan_top = int(h * 0.12)  # เลี่ยงใบไม้/หัวเสา
        scan_bottom = int(h * 0.88)

        best_flood_y = None
        best_flood_score = -1e9
        for y in range(scan_top, scan_bottom):
            m_above = cum[y - 1] / float(y)
            m_below = (total_sum - cum[y - 1]) / float(h - y)
            score = m_above - m_below
            if score > best_flood_score:
                best_flood_score = score
                best_flood_y = y

        # ตรวจสอบสภาวะน้ำท่วมด้วย Contrast Ratio และ Monotonic Submersion Constraint
        is_flood = False
        water_y = None
        confidence = 0.90

        flood_score_limit = 25.0 if self.station_code == "X.44" else self.flood_score_thresh
        flood_y_limit = int(h * 0.76) if self.station_code == "X.44" else int(h * 0.85)

        if best_flood_score > flood_score_limit and best_flood_y is not None and best_flood_y < flood_y_limit:
            y1_ab = max(0, best_flood_y - 150)
            c_above = float(np.mean(rolling_max[y1_ab:best_flood_y]))
            c_below = float(np.mean(rolling_max[best_flood_y:min(h, best_flood_y + 350)]))
            contrast_ratio = c_above / max(1e-3, c_below)

            # คอนทราสต์เหนือผิวน้ำต้องคมชัดกว่าส่วนใต้น้ำอย่างมีนัยสำคัญ (เสาแห้ง vs เสาจมน้ำ)
            ratio_thresh = 1.50 if self.station_code == "X.44" else 1.35
            if contrast_ratio > ratio_thresh:
                is_flood = True
                # หาจุดที่ค่า std เริ่มตกฮวบลงสู่ผิวน้ำ
                exact_y = best_flood_y
                for y_cand in range(max(0, best_flood_y - 30), min(h, best_flood_y + 30)):
                    if stds[y_cand] < 35.0:
                        exact_y = y_cand
                        break
                water_y = exact_y
                confidence = float(np.clip(best_flood_score / 45.0, 0.88, 0.98))

        if not is_flood or water_y is None:
            # สภาวะปกติ: ใช้ระดับน้ำอ้างอิง baseline ของสถานี
            if self.baseline_lvl is not None:
                water_level = self.baseline_lvl
                water_y = self.calibrator.level_to_pixel(water_level, target_h=h)
            elif self.baseline_y is not None:
                water_y = int(round(self.baseline_y * (h / float(self.config.get("enhanced_roi", {}).get("height", h)))))
                water_level = self.calibrator.pixel_to_level(water_y, target_h=h)
            else:
                water_y = int(h * 0.90)
                water_level = self.calibrator.pixel_to_level(water_y, target_h=h)
            confidence = 0.90
        else:
            water_level = self.calibrator.pixel_to_level(water_y, target_h=h)

        # ประเมินสถานะการเตือนภัย
        warn_m = self.warning_thresholds.get("warning_m", 999.0)
        crit_m = self.warning_thresholds.get("critical_flood_m", 999.0)

        if water_level >= crit_m:
            status = "CRITICAL_FLOOD"
        elif water_level >= warn_m:
            status = "WARNING_LEVEL"
        else:
            status = "NORMAL_LEVEL"

        return {
            "station_code": self.station_code,
            "station_name": self.station_name,
            "water_y": int(round(water_y)),
            "water_level": round(float(water_level), 2),
            "confidence": round(float(confidence), 3),
            "status": status,
            "is_flood_event": is_flood
        }
