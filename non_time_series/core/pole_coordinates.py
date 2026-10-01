"""
Pole Coordinates & Perspective Homography Geometry Module
ระบบคำนวณและจัดการพิกัดเสาวัดระดับน้ำ (Staff Gauge Coordinates) ทั้ง 3 สถานี
- คำนวณเมทริกซ์การแปลงมุมมอง 4-Point Homography (M) และ Inverse Perspective Transform (M^-1)
- คำนวณมุมเอียง (Tilt Angle), สัดส่วนขนาด (Aspect Ratio), และความละเอียดพิกเซลต่อเมตร (Pixels per Meter)
- ดัดภาพเสาให้ตรง (Perspective Rectification) และแปลงพิกัดผิวน้ำกลับสู่จอมอนิเตอร์กล้อง CCTV อย่างแม่นยำ
"""

import os
import json
import math
import cv2
import numpy as np


class PoleCoordinateManager:
    """
    ตัวจัดการพิกัดและเรขาคณิตของเสาวัดน้ำสำหรับสถานีโทรมาตร/CCTV
    """
    def __init__(self, config_dict_or_path):
        if isinstance(config_dict_or_path, str):
            with open(config_dict_or_path, "r", encoding="utf-8") as f:
                self.config = json.load(f)
        else:
            self.config = config_dict_or_path

        self.station_name = self.config.get("station_name", "Unknown")
        self.station_code = self.config.get("station_code", "Unknown")
        self.ref_res = self.config.get("reference_frame_resolution", [1920, 1080])
        self.ref_w, self.ref_h = self.ref_res

        self.has_polygon = "staff_gauge_polygon" in self.config
        self.has_bbox = "staff_gauge_bbox" in self.config

        # ขนาดภาพ Rectified และ Enhanced ROI
        self.rect_w = self.config.get("rectified_roi", {}).get("width", 40)
        self.rect_h = self.config.get("rectified_roi", {}).get("height", 1120)
        self.enh_w = self.config.get("enhanced_roi", {}).get("width", 80)
        self.enh_h = self.config.get("enhanced_roi", {}).get("height", 2240)
        self.upscale_factor = self.config.get("enhanced_roi", {}).get("upscale_factor", 2.0)

        # เมทริกซ์ Homography
        self.M = None
        self.M_inv = None
        self.last_pts_src = None

    def get_source_points(self, frame_shape):
        """คำนวณพิกัดมุม 4 จุดของเสาบนเฟรมภาพปัจจุบันตาม Resolution"""
        h_curr, w_curr = frame_shape[:2]
        scale_x = w_curr / float(self.ref_w)
        scale_y = h_curr / float(self.ref_h)

        if self.has_polygon:
            poly = self.config["staff_gauge_polygon"]
            pts = np.float32([
                [poly["top_left"][0] * scale_x, poly["top_left"][1] * scale_y],
                [poly["top_right"][0] * scale_x, poly["top_right"][1] * scale_y],
                [poly["bottom_right"][0] * scale_x, poly["bottom_right"][1] * scale_y],
                [poly["bottom_left"][0] * scale_x, poly["bottom_left"][1] * scale_y]
            ])
        elif self.has_bbox:
            bbox = self.config["staff_gauge_bbox"]
            x1, y1 = bbox["x1"] * scale_x, bbox["y1"] * scale_y
            x2, y2 = bbox["x2"] * scale_x, bbox["y2"] * scale_y
            pts = np.float32([
                [x1, y1],
                [x2, y1],
                [x2, y2],
                [x1, y2]
            ])
        else:
            raise ValueError(f"No polygon or bbox specified in config for station {self.station_name}")

        return pts

    def compute_homography_matrices(self, frame_shape):
        """คำนวณเมทริกซ์การแปลงมุมมอง Homography (M) และ Inverse Transform (M^-1)"""
        pts_src = self.get_source_points(frame_shape)
        pts_dst = np.float32([
            [0, 0],
            [self.rect_w, 0],
            [self.rect_w, self.rect_h],
            [0, self.rect_h]
        ])

        self.M = cv2.getPerspectiveTransform(pts_src, pts_dst)
        self.M_inv = cv2.getPerspectiveTransform(pts_dst, pts_src)
        self.last_pts_src = pts_src
        return self.M, self.M_inv, pts_src

    def extract_and_rectify(self, frame):
        """
        ดัดมุมมองเสาวัดน้ำและปรับปรุงคุณภาพความคมชัด (Rectify + CLAHE + Unsharp Masking)
        ส่งคืน: (rectified_roi, enhanced_roi, pts_src)
        """
        self.compute_homography_matrices(frame.shape)

        if self.has_polygon:
            rectified = cv2.warpPerspective(frame, self.M, (self.rect_w, self.rect_h))
            upscaled = cv2.resize(rectified, (self.enh_w, self.enh_h), interpolation=cv2.INTER_LANCZOS4)
            lab = cv2.cvtColor(upscaled, cv2.COLOR_BGR2LAB)
            l, a, b_ch = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
            l_enh = clahe.apply(l)
            enhanced_lab = cv2.merge([l_enh, a, b_ch])
            enhanced_bgr = cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2BGR)
            gaussian = cv2.GaussianBlur(enhanced_bgr, (0, 0), sigmaX=1.5)
            sharpened = cv2.addWeighted(enhanced_bgr, 1.35, gaussian, -0.35, 0)
            return rectified, sharpened, self.last_pts_src
        else:
            # กรณี BBox สี่เหลี่ยมมุมฉากตรง (Muangkong & Bangsala)
            pts = self.last_pts_src
            x1, y1 = int(round(pts[0][0])), int(round(pts[0][1]))
            x2, y2 = int(round(pts[2][0])), int(round(pts[2][1]))
            x1 = max(0, min(x1, frame.shape[1] - 1))
            x2 = max(x1 + 1, min(x2, frame.shape[1]))
            y1 = max(0, min(y1, frame.shape[0] - 1))
            y2 = max(y1 + 1, min(y2, frame.shape[0]))
            crop = frame[y1:y2, x1:x2].copy()
            enhanced = cv2.resize(crop, (self.enh_w, self.enh_h), interpolation=cv2.INTER_LANCZOS4)
            return crop, enhanced, self.last_pts_src

    def transform_gauge_to_cctv(self, x_enhanced, y_enhanced):
        """
        แปลงพิกัด (X, Y) บนแท่งเสาขยาย (Enhanced ROI) กลับสู่พิกัดพิกเซลจริงบนกล้อง CCTV
        โดยใช้เมทริกซ์ Inverse Homography (M^-1) ทำให้เส้นผิวน้ำตรงกับของจริง 100%
        """
        if self.M_inv is None:
            raise RuntimeError("Must call compute_homography_matrices or extract_and_rectify first")

        # ทอนสเกล Enhanced กลับสู่ Rectified Coordinate
        x_rect = float(x_enhanced) / float(self.enh_w) * float(self.rect_w)
        y_rect = float(y_enhanced) / float(self.enh_h) * float(self.rect_h)

        if self.has_polygon:
            pt_rect = np.array([[[x_rect, y_rect]]], dtype=np.float32)
            pt_frame = cv2.perspectiveTransform(pt_rect, self.M_inv)
            fx = float(pt_frame[0, 0, 0])
            fy = float(pt_frame[0, 0, 1])
            return fx, fy
        else:
            # กรณี BBox
            pts = self.last_pts_src
            x1, y1 = pts[0][0], pts[0][1]
            x2, y2 = pts[2][0], pts[2][1]
            norm_x = x_rect / float(self.rect_w)
            norm_y = y_rect / float(self.rect_h)
            fx = x1 + norm_x * (x2 - x1)
            fy = y1 + norm_y * (y2 - y1)
            return fx, fy

    def calculate_pole_geometry(self, frame_shape=None):
        """
        คำนวณคุณสมบัติทางเรขาคณิตของเสา:
        - ความยาวเสาจริงบนภาพ (Pixel Height)
        - ความกว้างหัวเสา / โคนเสา (Tapering Width)
        - มุมเอียงจากแนวดิ่ง (Tilt Angle in degrees)
        - ค่าสเกลความละเอียดพิกเซลต่อเมตรเฉลี่ย (Pixels per Meter)
        """
        shape = frame_shape if frame_shape is not None else (self.ref_h, self.ref_w, 3)
        pts = self.get_source_points(shape)

        top_left, top_right, bottom_right, bottom_left = pts

        top_width = np.linalg.norm(top_right - top_left)
        bottom_width = np.linalg.norm(bottom_right - bottom_left)
        left_height = np.linalg.norm(bottom_left - top_left)
        right_height = np.linalg.norm(bottom_right - top_right)
        avg_height = (left_height + right_height) / 2.0

        # เวกเตอร์แกนกลางเสา
        top_center = (top_left + top_right) / 2.0
        bottom_center = (bottom_left + bottom_right) / 2.0
        dx = bottom_center[0] - top_center[0]
        dy = bottom_center[1] - top_center[1]

        # มุมเอียงเทียบกับแกนตั้งฉากแนวดิ่ง (Vertical Y-axis, downward)
        tilt_angle_deg = math.degrees(math.atan2(dx, dy))

        # คำนวณ Pixels per Meter จาก Anchors
        anchors = self.config.get("piecewise_anchors", [])
        if len(anchors) >= 2:
            max_lvl, min_y = anchors[0]
            min_lvl, max_y = anchors[-1]
            delta_lvl = abs(max_lvl - min_lvl)
            delta_enh_y = abs(max_y - min_y)
            px_per_meter_enhanced = delta_enh_y / max(1e-3, delta_lvl)
            px_per_meter_raw = (avg_height) / max(1e-3, delta_lvl)
        else:
            px_per_meter_enhanced = 0.0
            px_per_meter_raw = 0.0

        return {
            "station_code": self.station_code,
            "station_name": self.station_name,
            "resolution": [shape[1], shape[0]],
            "source_points": pts.tolist(),
            "top_width_px": round(float(top_width), 2),
            "bottom_width_px": round(float(bottom_width), 2),
            "average_height_px": round(float(avg_height), 2),
            "tilt_angle_degrees": round(float(tilt_angle_deg), 2),
            "perspective_taper_ratio": round(float(bottom_width / max(1e-3, top_width)), 3),
            "pixels_per_meter_raw": round(float(px_per_meter_raw), 2),
            "pixels_per_meter_enhanced": round(float(px_per_meter_enhanced), 2)
        }
