"""
Water Surface Contact Detector Module
ระบบตรวจจับจุดตัดผิวน้ำสัมผัสกับเสาวัดระดับน้ำ (Water Surface Contact Line)
รองรับทั้งสภาวะกลางวัน (Daytime) และอินฟราเรดกลางคืน (Night IR)
ใช้อัลกอริทึม 1D Change Point Analysis + Monotonic Submersion Constraint + Multimodal Validation
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
        self.calibration_bias = station_config.get("calibration_bias_m", 0.0)

    def detect_waterline(self, enhanced_gauge: np.ndarray) -> dict:
        """
        ตรวจจับตำแหน่ง Y ของเส้นผิวน้ำบนภาพ Enhanced Staff Gauge
        ส่งคืน: dict ข้อมูลระดับน้ำ, ความเชื่อมั่น, สถานะการเตือนภัย
        """
        h, w = enhanced_gauge.shape[:2]

        # 1. ตรวจสอบสภาวะกลางคืน (Night IR Mode / Low Light)
        hsv = cv2.cvtColor(enhanced_gauge, cv2.COLOR_BGR2HSV)
        s_val = float(np.mean(hsv[:, :, 1]))
        v_val = float(np.mean(hsv[:, :, 2]))
        is_night = (s_val < 20.0 and v_val < 90.0) or (v_val < 65.0) or (s_val < 5.0)

        # Contrast enhancement สำหรับภาพกลางคืน
        gray = cv2.cvtColor(enhanced_gauge, cv2.COLOR_BGR2GRAY)
        if is_night:
            clahe = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(8, 8))
            norm_gray = clahe.apply(gray)
        else:
            norm_gray = gray

        # คำนวณ Standard Deviation ตามแนวนอนเฉพาะบริเวณหน้าเสา (ตัดขอบข้างออก)
        cx1 = int(w * 0.15)
        cx2 = int(w * 0.85)
        stds = np.array([np.std(norm_gray[y, cx1:cx2]) for y in range(h)], dtype=np.float32)

        # Rolling Max เพื่อลดสัญญาณรบกวนระหว่างตัวเลข/ขีดวัด
        win = 35
        rolling_max = np.array([
            np.max(stds[max(0, y - win // 2):min(h, y + win // 2)])
            for y in range(h)
        ])
        cum = np.cumsum(rolling_max)
        total_sum = cum[-1]

        # กำหนดขอบเขตสแกนหาจุดน้ำท่วม (Flood Search Range)
        if self.station_code == "X.44":
            scan_top = 200
            scan_bottom = h - 35   # scan all the way to near-bottom (waterline ≈ Y 2130 in 2252px image)
        elif self.station_code == "X.90":
            scan_top = 550 if is_night else 200
            scan_bottom = min(h - 50, (self.baseline_y - 80) if self.baseline_y else 1600)
        else:  # Muangkong X.173A
            scan_top = 150
            scan_bottom = h - 50

        best_flood_y = None
        best_flood_score = -1e9
        for y in range(scan_top, max(scan_top + 10, scan_bottom)):
            m_above = (cum[y - 1] - cum[scan_top]) / float(max(1, y - scan_top))
            m_below = (total_sum - cum[y - 1]) / float(max(1, h - y))
            score = m_above - m_below
            if score > best_flood_score:
                best_flood_score = score
                best_flood_y = y

        # ตรวจสอบสภาวะน้ำท่วมด้วย Monotonic Submersion Constraint & Contrast Ratio
        is_flood = False
        water_y = None
        confidence = 0.92

        if self.station_code == "X.44":
            if best_flood_score > 15.0 and best_flood_y is not None:
                y1_ab = max(0, best_flood_y - 150)
                c_above = float(np.mean(rolling_max[y1_ab:best_flood_y]))
                c_below = float(np.mean(rolling_max[best_flood_y:min(h, best_flood_y + 200)]))
                contrast_ratio = c_above / max(1e-3, c_below)
                if contrast_ratio > 1.25:
                    is_flood = True
                    # Refine: find first Y in neighbourhood where STD drops below 25
                    sr_min = max(0, best_flood_y - 80)
                    sr_max = min(h - 10, best_flood_y + 80)
                    exact_y = best_flood_y
                    found = False
                    for y_cand in range(sr_min, sr_max):
                        if stds[y_cand] < 25.0:
                            exact_y = y_cand
                            found = True
                            break
                    if not found:
                        g_seg = np.gradient(-stds[sr_min:sr_max])
                        if len(g_seg) > 0:
                            exact_y = sr_min + int(np.argmax(g_seg))
                    water_y = exact_y
                    confidence = float(np.clip(best_flood_score / 80.0, 0.75, 0.96))
        else:
            flood_limit = self.flood_score_thresh
            if best_flood_score > flood_limit and best_flood_y is not None:
                m_ab = (cum[best_flood_y - 1] - cum[scan_top]) / float(max(1, best_flood_y - scan_top))
                m_bl = (total_sum - cum[best_flood_y - 1]) / float(max(1, h - best_flood_y))
                if m_bl < 0.60 * m_ab:
                    is_flood = True
                    search_r = 30
                    y_min = max(0, best_flood_y - search_r)
                    y_max = min(h, best_flood_y + search_r)
                    grad = np.gradient(-stds[y_min:y_max])
                    water_y = y_min + int(np.argmax(grad))
                    confidence = float(np.clip(best_flood_score / 60.0, 0.60, 0.98))

        if not is_flood or water_y is None:
            # ลองค้นหาผิวน้ำในโซนล่างก่อน (Bottom-Zone Gradient Scan)
            # -- X.44 (Hat Yai Nai): สแกน 500 px ล่างสุด
            if self.station_code == "X.44":
                bz_start = max(0, h - 500)
                bz_stds = stds[bz_start:]
                found_bottom = False
                for y_c in range(len(bz_stds)):
                    if bz_stds[y_c] < 25.0:
                        water_y = bz_start + y_c
                        confidence = 0.78
                        found_bottom = True
                        break
                if not found_bottom:
                    g_seg = np.gradient(-bz_stds)
                    if len(g_seg) > 0 and np.max(g_seg) > 2.0:
                        water_y = bz_start + int(np.argmax(g_seg))
                        confidence = 0.72
                        found_bottom = True
                if not found_bottom:
                    water_y = self.baseline_y if self.baseline_y is not None else int(h * 0.90)
                    confidence = 0.55

            # -- X.90 (Bang Sala): สแกน 400 px ใกล้ baseline
            elif self.station_code == "X.90":
                bz_start = max(0, (self.baseline_y - 200) if self.baseline_y else h - 400)
                bz_stds = stds[bz_start:]
                found_bottom = False
                for y_c in range(len(bz_stds)):
                    if bz_stds[y_c] < 25.0:
                        water_y = bz_start + y_c
                        confidence = 0.78
                        found_bottom = True
                        break
                if not found_bottom:
                    g_seg = np.gradient(-bz_stds)
                    if len(g_seg) > 0 and np.max(g_seg) > 2.0:
                        water_y = bz_start + int(np.argmax(g_seg))
                        confidence = 0.72
                        found_bottom = True
                if not found_bottom:
                    water_y = self.baseline_y if self.baseline_y is not None else int(h * 0.90)
                    confidence = 0.55

            # -- X.173A (Muang Kong): สแกนโซน 1950-end กลางวัน, ทั้งหมดกลางคืน
            else:
                if not is_night and h >= 1950:
                    bz_start = 1950
                else:
                    bz_start = max(0, h - 400)
                bz_stds = stds[bz_start:]
                grad = np.gradient(-bz_stds)
                if len(grad) > 0 and np.max(grad) > 3.0:
                    water_y = bz_start + int(np.argmax(grad))
                    confidence = 0.75
                else:
                    water_y = self.baseline_y if self.baseline_y is not None else (
                        1985 if h >= 1950 else int(h * 0.90)
                    )
                    confidence = 0.55


        raw_level = self.calibrator.pixel_to_level(water_y)
        water_level = round(raw_level - self.calibration_bias, 2)

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
            "raw_level": round(float(raw_level), 3),
            "water_level": float(water_level),
            "confidence": round(float(confidence), 3),
            "status": status,
            "is_flood_event": is_flood,
            "is_night": is_night
        }
