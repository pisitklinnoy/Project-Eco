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
    def __init__(self, anchors, base_height=None):
        """
        anchors: รายการ [(level_m, y_px), ...] เรียงจากระดับน้ำสูงสุด (บน) ไปต่ำสุด (ล่าง)
        """
        # เรียงตามระดับน้ำจากมากไปน้อย
        self.anchors = sorted(anchors, key=lambda x: x[0], reverse=True)
        self.levels = np.array([a[0] for a in self.anchors], dtype=np.float32)
        self.y_coords = np.array([a[1] for a in self.anchors], dtype=np.float32)

        if base_height is not None:
            self.base_h = float(base_height)
        else:
            self.base_h = float(self.y_coords[-1]) if len(self.y_coords) > 0 else 1000.0

    def pixel_to_level(self, y_pixel: float, target_h: int = None) -> float:
        """แปลงพิกัด Y บนเสาวัดน้ำเป็นระดับความสูง (เมตร รทก.)"""
        if target_h is not None and target_h != self.base_h:
            y_norm = y_pixel * (self.base_h / float(target_h))
        else:
            y_norm = y_pixel

        # แปลงด้วย Piecewise Linear Interpolation (y เพิ่มขึ้น = ระดับน้ำลดลง)
        level = float(np.interp(y_norm, self.y_coords, self.levels))
        return level

    def level_to_pixel(self, level_m: float, target_h: int = None) -> int:
        """แปลงระดับน้ำ (เมตร รทก.) เป็นพิกัด Y บนเสาวัดน้ำ"""
        # levels เรียงจากมากไปน้อย ต้องกลับด้านสำหรับ np.interp
        y_norm = float(np.interp(level_m, self.levels[::-1], self.y_coords[::-1]))

        if target_h is not None and target_h != self.base_h:
            y_target = y_norm * (float(target_h) / self.base_h)
        else:
            y_target = y_norm

        return int(round(y_target))

    def generate_meter_ticks(self, step=0.1, target_h=None):
        """สร้างรายการขีดวัดระดับน้ำทุกๆ step เมตร (เช่น 0.1 ม. หรือ 1.0 ม.)"""
        min_lvl = math_floor = np.min(self.levels)
        max_lvl = np.max(self.levels)
        
        ticks = []
        curr = max_lvl
        while curr >= min_lvl - 1e-4:
            y = self.level_to_pixel(curr, target_h=target_h)
            is_full_meter = abs(round(curr) - curr) < 1e-4
            ticks.append({
                "level": round(float(curr), 2),
                "y": y,
                "is_full_meter": is_full_meter
            })
            curr -= step
        return ticks

    def render_calibrated_overlay(
        self,
        image: np.ndarray,
        water_surface_y: float = None,
        water_surface_level: float = None
    ) -> np.ndarray:
        """
        วาดสเกลไม้บรรทัดละเอียดสไตล์ Professional Dark Theme ตามรูปแบบ verify_daytime_normal.jpg
        - พื้นหลังดำเข้มกลืนกับภาพ (26, 26, 26)
        - ขีดระดับเต็มเมตรยาวสีเหลืองทอง (0, 215, 255) พร้อมตัวเลขชัดเจน
        - ขีดกลาง 50 ซม. (255, 200, 0) และขีดย่อย 10 ซม.
        - เส้นระดับน้ำสีส้มสะท้อนแสง (0, 140, 255)
        """
        h, w = image.shape[:2]
        overlay_w = w + 160
        canvas = np.zeros((h, overlay_w, 3), dtype=np.uint8)
        canvas[:] = (26, 26, 26)
        canvas[:, :w] = image

        # วาดเส้นสเกลทุก 10 ซม. (0.1m) ตามช่วงของ Anchors
        min_lvl = min(a[0] for a in self.anchors)
        max_lvl = max(a[0] for a in self.anchors)

        # ไม่แสดงต่ำกว่า min_lvl (เช่น ไม่แสดง 0.0 ม.)
        curr_lvl = round(min_lvl, 1)
        end_lvl = round(max_lvl, 1)

        curr = curr_lvl
        while curr <= end_lvl + 1e-4:
            y_pos = self.level_to_pixel(curr, target_h=h)
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
                elif is_half:
                    # ขีดกลาง 50 ซม. (สีฟ้าอ่อน)
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

        # วาดเส้นระดับน้ำสีส้มสะท้อนแสง
        if water_surface_y is not None:
            calc_lvl = water_surface_level if water_surface_level is not None else self.pixel_to_level(water_surface_y, target_h=h)
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

        return canvas

    def render_digital_ruler(self, height: int, width: int = 140, current_level: float = None, warning_lvl: float = None, critical_lvl: float = None):
        """Wrapper เข้ากันได้กับโค้ดเดิม"""
        blank = np.zeros((height, 80, 3), dtype=np.uint8)
        blank[:] = (26, 26, 26)
        overlay = self.render_calibrated_overlay(blank, water_surface_level=current_level)
        return overlay[:, 80:]

