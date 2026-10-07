"""
Water Surface Contact Detector Module
ระบบตรวจจับจุดตัดผิวน้ำสัมผัสกับเสาวัดระดับน้ำ (Water Surface Contact Line)
รองรับทั้งสภาวะกลางวัน (Daytime) และอินฟราเรดกลางคืน (Night IR)
ใช้อัลกอริทึม Bottom-Up Scan + Gradient Refinement
โซนที่จมน้ำ (ล่าง) = STD ต่ำ  →  โซนเสาโผล่น้ำ (บน) = STD สูง
"""

import cv2
import numpy as np
from .scale_calibrator import PiecewiseScaleCalibrator


class WaterSurfaceDetector:
    """
    ระบบตรวจจับผิวน้ำอัตโนมัติบนภาพเสาวัดน้ำ Enhanced ROI
    ใช้ Bottom-Up Scan: สแกนจากล่างขึ้นบน หาจุดแรกที่ STD พุ่งสูง = ผิวน้ำจริง
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

        # threshold ต่อสถานี (ปรับตามลักษณะภาพของแต่ละสถานี)
        self._submerged_thresh = station_config.get("submerged_std_thresh", 35.0)
        self._exposed_thresh   = station_config.get("exposed_std_thresh",   45.0)

    # ------------------------------------------------------------------
    # Helper: Bottom-Up Scan
    # ------------------------------------------------------------------
    def _bottom_up_scan(self, stds: np.ndarray, h: int, scan_top: int) -> tuple:
        """
        สแกนจากล่างขึ้นบน หาจุดเปลี่ยน STD ต่ำ→สูง (ผิวน้ำจริง)
        คืนค่า (water_y, confidence) หรือ (None, 0.0) ถ้าไม่เจอ
        """
        smooth_w = 15
        stds_smooth = np.convolve(stds, np.ones(smooth_w) / smooth_w, mode='same')

        submerged_thresh = self._submerged_thresh
        exposed_thresh   = self._exposed_thresh

        # ขั้น 1: หาจุดล่างสุดที่ยัง STD ต่ำ (จมน้ำ)
        deepest_sub = None
        for yb in range(h - 1, scan_top, -1):
            if stds_smooth[yb] < submerged_thresh:
                deepest_sub = yb
                break

        if deepest_sub is None:
            return None, 0.0

        # ขั้น 2: scan ขึ้นจาก deepest_sub หาจุดแรกที่ STD สูงเกิน exposed_thresh
        waterline_y = deepest_sub
        for yu in range(deepest_sub, scan_top, -1):
            if stds_smooth[yu] >= exposed_thresh:
                waterline_y = yu
                break

        # ขั้น 3: refine ด้วย gradient ในย่าน ±60px รอบจุดที่หาได้
        #   rising gradient of STD = STD เปลี่ยนจากต่ำ→สูง = ผิวน้ำ
        ref_min = max(scan_top, waterline_y - 60)
        ref_max = min(h - 5, waterline_y + 60)
        seg = stds[ref_min:ref_max]
        if len(seg) > 5:
            g = np.gradient(seg)
            water_y = ref_min + int(np.argmax(g))
        else:
            water_y = waterline_y

        # clamp ไม่ให้เกิน anchor ล่างสุด
        lowest_anchor_y = max(a[1] for a in self.calibrator.anchors)
        water_y = min(water_y, lowest_anchor_y)

        # confidence จาก gradient magnitude ณ จุดผิวน้ำ
        conf_score = float(np.max(np.gradient(seg))) if len(seg) > 5 else 0.0
        confidence = float(np.clip(conf_score / 30.0, 0.70, 0.96))

        return water_y, confidence

    # ------------------------------------------------------------------
    # Main detection
    # ------------------------------------------------------------------
    def detect_waterline(self, enhanced_gauge: np.ndarray) -> dict:
        """
        ตรวจจับตำแหน่ง Y ของเส้นผิวน้ำบนภาพ Enhanced Staff Gauge
        ส่งคืน: dict ข้อมูลระดับน้ำ, ความเชื่อมั่น, สถานะการเตือนภัย
        """
        h, w = enhanced_gauge.shape[:2]

        # 1. ตรวจสอบสภาวะกลางคืน (Night IR / Low Light)
        hsv = cv2.cvtColor(enhanced_gauge, cv2.COLOR_BGR2HSV)
        s_val = float(np.mean(hsv[:, :, 1]))
        v_val = float(np.mean(hsv[:, :, 2]))
        is_night = (s_val < 20.0 and v_val < 90.0) or (v_val < 65.0) or (s_val < 5.0)

        # 2. Contrast enhancement กลางคืน
        gray = cv2.cvtColor(enhanced_gauge, cv2.COLOR_BGR2GRAY)
        if is_night:
            clahe = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(8, 8))
            norm_gray = clahe.apply(gray)
        else:
            norm_gray = gray

        # 3. คำนวณ STD รายแถว (เฉพาะกลางเสา ตัดขอบ 15% ออก)
        cx1 = int(w * 0.15)
        cx2 = int(w * 0.85)
        stds = np.array([np.std(norm_gray[y, cx1:cx2]) for y in range(h)], dtype=np.float32)

        # 4. กำหนดช่วงสแกนตามสถานี
        if self.station_code == "X.44":
            scan_top = 200
        elif self.station_code == "X.90":
            scan_top = 550 if is_night else 200
        else:  # X.173A
            scan_top = 150

        # ==============================================================
        # 5. Bottom-Up Scan (วิธีหลัก — ทุกสถานี)
        # ==============================================================
        water_y, confidence = self._bottom_up_scan(stds, h, scan_top)
        is_flood = water_y is not None

        # ==============================================================
        # 6. Fallback: ถ้า Bottom-Up ไม่เจอ → ใช้ Change-Point Analysis
        # ==============================================================
        if not is_flood:
            # Rolling Max เพื่อลด noise
            win = 35
            rolling_max = np.array([
                np.max(stds[max(0, y - win // 2):min(h, y + win // 2)])
                for y in range(h)
            ])
            cum = np.cumsum(rolling_max)
            total_sum = cum[-1]

            if self.station_code == "X.44":
                scan_bottom = h - 35
            elif self.station_code == "X.90":
                scan_bottom = min(h - 50, (self.baseline_y - 80) if self.baseline_y else 1600)
            else:
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

            flood_limit = self.flood_score_thresh
            if best_flood_score > flood_limit and best_flood_y is not None:
                m_ab = (cum[best_flood_y - 1] - cum[scan_top]) / float(max(1, best_flood_y - scan_top))
                m_bl = (total_sum - cum[best_flood_y - 1]) / float(max(1, h - best_flood_y))
                if m_bl < 0.65 * m_ab:
                    is_flood = True
                    search_r = 40
                    y_min = max(0, best_flood_y - search_r)
                    y_max = min(h, best_flood_y + search_r)
                    grad = np.gradient(-stds[y_min:y_max])
                    water_y = y_min + int(np.argmax(grad))
                    confidence = float(np.clip(best_flood_score / 60.0, 0.65, 0.96))

        # ==============================================================
        # 7. Last Resort: baseline หรือ bottom-of-image
        # ==============================================================
        if not is_flood or water_y is None:
            water_y = self.baseline_y if self.baseline_y is not None else int(h * 0.90)
            confidence = 0.50

        raw_level  = self.calibrator.pixel_to_level(water_y)
        water_level = round(raw_level - self.calibration_bias, 2)

        # 8. ประเมินสถานะเตือนภัย
        warn_m = self.warning_thresholds.get("warning_m", 999.0)
        crit_m = self.warning_thresholds.get("critical_flood_m", 999.0)

        if water_level >= crit_m:
            status = "CRITICAL_FLOOD"
        elif water_level >= warn_m:
            status = "WARNING_LEVEL"
        else:
            status = "NORMAL_LEVEL"

        return {
            "station_code":   self.station_code,
            "station_name":   self.station_name,
            "water_y":        int(round(water_y)),
            "raw_level":      round(float(raw_level), 3),
            "water_level":    float(water_level),
            "confidence":     round(float(confidence), 3),
            "status":         status,
            "is_flood_event": is_flood,
            "is_night":       is_night
        }
