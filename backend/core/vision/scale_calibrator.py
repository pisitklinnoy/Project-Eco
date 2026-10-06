"""
Piecewise Scale Calibrator & Digital Staff Ruler
ระบบแปลงค่าตำแหน่งพิกเซล (Y) เป็นระดับน้ำจริง (m R.T.K.) และเรนเดอร์สเกลไม้บรรทัดดิจิทัล
รองรับการสอบเทียบเฉพาะจุด (Piecewise Perspective Calibration) ตามรอยต่อเสาจริง
"""

import cv2
import numpy as np


class PiecewiseScaleCalibrator:
    """
    คลาสสำหรับแปลงค่าพิกัดพิกเซลบนเสาวัดน้ำเป็นระดับน้ำจริง (เมตร รทก.)
    และสร้างแถบสเกลไม้บรรทัดดิจิทัล (Digital Staff Gauge Scale)
    """
    def __init__(self, anchors, station_name=None, bank_level=None):
        """
        anchors: รายการ [(level_m, y_px), ...] เรียงจากระดับน้ำสูงสุด (บน) ไปต่ำสุด (ล่าง)
        """
        self.anchors = sorted(anchors, key=lambda a: a[0], reverse=True)
        self.station_name = station_name
        self.bank_level = bank_level

    def pixel_to_level(self, y: float, target_h: int = None) -> float:
        """แปลงพิกัดพิกเซล Y เป็นระดับน้ำในหน่วยเมตร (m R.T.K.)"""
        if len(self.anchors) < 2:
            return 0.0

        # กรณีอยู่เหนือจุดอ้างอิงบนสุด (> สูงสุด)
        if y <= self.anchors[0][1]:
            ppm = (self.anchors[1][1] - self.anchors[0][1]) / (self.anchors[0][0] - self.anchors[1][0])
            return float(self.anchors[0][0] + (self.anchors[0][1] - y) / max(ppm, 1e-6))

        # กรณีอยู่ใต้จุดอ้างอิงล่างสุด (< ต่ำสุด)
        if y >= self.anchors[-1][1]:
            ppm = (self.anchors[-1][1] - self.anchors[-2][1]) / (self.anchors[-2][0] - self.anchors[-1][0])
            calc = float(self.anchors[-1][0] - (y - self.anchors[-1][1]) / max(ppm, 1e-6))
            return max(0.0, calc)

        # กรณีอยู่ระหว่างช่วงเมตรต่างๆ (Piecewise Linear Interpolation)
        for i in range(len(self.anchors) - 1):
            lvl_top, y_top = self.anchors[i]
            lvl_bot, y_bot = self.anchors[i + 1]
            if y_top <= y <= y_bot:
                frac = (y - y_top) / float(y_bot - y_top)
                return max(0.0, float(lvl_top - frac * (lvl_top - lvl_bot)))

        return max(0.0, float(self.anchors[-1][0]))

    def level_to_pixel(self, level: float, target_h: int = None) -> int:
        """แปลงระดับน้ำ (เมตร) เป็นพิกัดพิกเซล Y บน Enhanced ROI"""
        if len(self.anchors) < 2:
            return 0

        if level >= self.anchors[0][0]:
            ppm = (self.anchors[1][1] - self.anchors[0][1]) / (self.anchors[0][0] - self.anchors[1][0])
            return int(round(self.anchors[0][1] - (level - self.anchors[0][0]) * ppm))

        if level <= self.anchors[-1][0]:
            ppm = (self.anchors[-1][1] - self.anchors[-2][1]) / (self.anchors[-2][0] - self.anchors[-1][0])
            return int(round(self.anchors[-1][1] + (self.anchors[-1][0] - level) * ppm))

        for i in range(len(self.anchors) - 1):
            lvl_top, y_top = self.anchors[i]
            lvl_bot, y_bot = self.anchors[i + 1]
            if lvl_bot <= level <= lvl_top:
                frac = (lvl_top - level) / float(lvl_top - lvl_bot)
                return int(round(y_top + frac * (y_bot - y_top)))

        return int(round(self.anchors[-1][1]))

    def render_calibrated_overlay(
        self,
        image: np.ndarray,
        water_surface_y: float = None,
        water_surface_level: float = None,
        draw_boxes: bool = True,
        bank_level: float = None
    ) -> np.ndarray:
        """
        วาดสเกลไม้บรรทัดละเอียดสไตล์ Professional Dark Theme ตามรูปแบบ benchmark images
        - พื้นหลังดำเข้มกลืนกับภาพ (26, 26, 26)
        - ขีดระดับเต็มเมตรยาวสีเหลืองทอง (0, 215, 255) พร้อมตัวเลขชัดเจน
        - ขีดกลาง 50 ซม. (255, 200, 0) และขีดย่อย 10 ซม. (120, 120, 120)
        - จุด Anchor สีเขียว (0, 255, 0)
        - กรอบสี่เหลี่ยมสีเขียวรอบตัวเลข
        - เส้นระดับน้ำสีส้มสะท้อนแสง (0, 140, 255)
        """
        h, w = image.shape[:2]
        overlay_w = w + 160
        canvas = np.zeros((h, overlay_w, 3), dtype=np.uint8)
        canvas[:] = (26, 26, 26)
        canvas[:, :w] = image

        # ขอบเขตระดับน้ำสำหรับวาดสเกล เริ่มต้นจากระดับต่ำสุด 0.0 ม. เสมอ
        curr_lvl = 0.0
        max_lvl = max(a[0] for a in self.anchors)
        end_lvl = round(max_lvl + 0.25, 1)

        curr = curr_lvl
        while curr <= end_lvl + 1e-4:
            y_pos = self.level_to_pixel(curr)
            if 0 <= y_pos < h:
                is_meter = (abs(curr - round(curr)) < 0.01)
                is_half = (abs(curr - (int(curr) + 0.5)) < 0.01)

                if is_meter:
                    # ขีดใหญ่ระดับเต็มเมตร (สีเหลืองทอง)
                    cv2.line(canvas, (0, y_pos), (w + 40, y_pos), (0, 215, 255), 2)
                    cv2.putText(
                        canvas,
                        f"{curr:.1f} m",
                        (w + 45, y_pos + 6),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.65,
                        (0, 215, 255),
                        2,
                        cv2.LINE_AA
                    )
                    # จุด Anchor สีเขียวตรงกลางตัวเลข
                    cv2.circle(canvas, (int(w * 0.58), y_pos), 4, (0, 255, 0), -1)
                    if draw_boxes:
                        cv2.rectangle(canvas, (int(w * 0.35), y_pos - 15), (int(w * 0.80), y_pos + 15), (0, 255, 0), 1)
                elif is_half:
                    # ขีดกลาง 50 ซม. (สีฟ้าอ่อน / ส้มเหลือง)
                    cv2.line(canvas, (w, y_pos), (w + 25, y_pos), (255, 200, 0), 1)
                    cv2.putText(
                        canvas,
                        f"{curr:.1f}",
                        (w + 30, y_pos + 4),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.45,
                        (200, 200, 200),
                        1,
                        cv2.LINE_AA
                    )
                else:
                    # ขีดย่อย 10 ซม. (สีเทา)
                    cv2.line(canvas, (w, y_pos), (w + 12, y_pos), (120, 120, 120), 1)

            curr = round(curr + 0.1, 2)

        # วาดเส้นระดับตลิ่ง (Bank Level) ถ้ามี
        effective_bank = bank_level if bank_level is not None else self.bank_level
        if effective_bank is not None:
            y_bank = self.level_to_pixel(effective_bank)
            if 0 <= y_bank < h:
                cv2.line(canvas, (0, y_bank), (overlay_w, y_bank), (0, 0, 255), 2, cv2.LINE_AA)
                cv2.putText(
                    canvas,
                    f"- Bank Level {effective_bank:.2f}m",
                    (w + 10, y_bank - 8),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.45,
                    (0, 0, 255),
                    1,
                    cv2.LINE_AA
                )

        # วาดเส้นระดับน้ำสีส้มสะท้อนแสง
        if water_surface_y is not None:
            calc_lvl = water_surface_level if water_surface_level is not None else self.pixel_to_level(water_surface_y)
            y_int = int(round(water_surface_y))
            if 0 <= y_int < h:
                cv2.line(canvas, (0, y_int), (overlay_w, y_int), (0, 140, 255), 3, cv2.LINE_AA)
                cv2.putText(
                    canvas,
                    f"Water: {calc_lvl:.2f} m",
                    (15, max(30, y_int - 12)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.65,
                    (0, 140, 255),
                    2,
                    cv2.LINE_AA
                )
        elif water_surface_level is not None:
            y_water = self.level_to_pixel(water_surface_level)
            if 0 <= y_water < h:
                cv2.line(canvas, (0, y_water), (overlay_w, y_water), (0, 140, 255), 3, cv2.LINE_AA)
                cv2.putText(
                    canvas,
                    f"Water: {water_surface_level:.2f} m",
                    (15, max(30, y_water - 12)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.65,
                    (0, 140, 255),
                    2,
                    cv2.LINE_AA
                )

        return canvas

    def render_digital_ruler(self, height: int, width: int = 140, current_level: float = None, warning_lvl: float = None, critical_lvl: float = None):
        """Wrapper เข้ากันได้กับโค้ดเดิม"""
        blank = np.zeros((height, 80, 3), dtype=np.uint8)
        blank[:] = (26, 26, 26)
        overlay = self.render_calibrated_overlay(blank, water_surface_level=current_level)
        return overlay[:, 80:]
