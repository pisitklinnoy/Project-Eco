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

    def render_digital_ruler(self, height: int, width: int = 140, current_level: float = None, warning_lvl: float = None, critical_lvl: float = None):
        """
        วาดแถบไม้บรรทัดดิจิทัลสเกลละเอียด พร้อมขีดสเกลทุก 10 ซม. และตัวเลขทุกเต็มเมตร
        """
        ruler = np.full((height, width, 3), 245, dtype=np.uint8)

        # เส้นขอบขวาของแถบไม้บรรทัด
        cv2.line(ruler, (width - 1, 0), (width - 1, height), (180, 180, 180), 2)

        # ขีดระดับทุก 10 ซม. (0.10 m)
        ticks = self.generate_meter_ticks(step=0.1, target_h=height)

        for tick in ticks:
            lvl = tick["level"]
            y = tick["y"]
            if y < 0 or y >= height:
                continue

            if tick["is_full_meter"]:
                # ขีดยาวเต็มเมตร + ตัวเลข
                # สีเส้นแบ่งระดับ: วิกฤต (แดง), เตือนภัย (ส้ม), ปกติ (น้ำเงินเข้ม)
                color = (40, 40, 140)
                if critical_lvl and lvl >= critical_lvl:
                    color = (40, 40, 220)
                elif warning_lvl and lvl >= warning_lvl:
                    color = (30, 140, 240)

                cv2.line(ruler, (width - 32, y), (width - 2, y), color, 2)
                text = f"{lvl:.1f}m"
                cv2.putText(ruler, text, (8, y + 5), cv2.FONT_HERSHEY_SIMPLEX, 0.48, color, 1, cv2.LINE_AA)
            else:
                # ขีดสั้น 10 ซม.
                cv2.line(ruler, (width - 15, y), (width - 2, y), (140, 140, 140), 1)

        # ขีดบอกระดับน้ำปัจจุบัน (ถ้ามีระบุ)
        if current_level is not None:
            cur_y = self.level_to_pixel(current_level, target_h=height)
            if 0 <= cur_y < height:
                cv2.line(ruler, (0, cur_y), (width - 1, cur_y), (0, 140, 255), 3)
                cv2.circle(ruler, (width - 10, cur_y), 5, (0, 140, 255), -1)

        return ruler
