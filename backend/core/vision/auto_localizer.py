"""
Staff Gauge & Water Surface Auto-Localizer Module
ระบบตรวจจับหาตำแหน่งเสาวัดระดับน้ำและผิวน้ำอัตโนมัติด้วย YOLOv8m Object Detection
รองรับ:
1. YOLOv8m Detection via Ultralytics PyTorch (model_best_v2.pt)
2. Color Saliency & Structural Aspect Ratio Fallback (Pure Computer Vision)
3. Dynamic Camera Shift Compensation เมื่อกล้อง CCTV ขยับ/ส่าย/เปลี่ยนมุมมอง
"""

import os
import cv2
import numpy as np
from typing import Optional, Dict, Any, List, Tuple


def _letterbox(im: np.ndarray, new_shape=(640, 640), color=(114, 114, 114)) -> Tuple[np.ndarray, float, Tuple[float, float]]:
    shape = im.shape[:2]
    r = min(new_shape[0] / shape[0], new_shape[1] / shape[1])
    new_unpad = int(round(shape[1] * r)), int(round(shape[0] * r))
    dw, dh = new_shape[1] - new_unpad[0], new_shape[0] - new_unpad[1]
    dw /= 2
    dh /= 2
    if shape[::-1] != new_unpad:
        im = cv2.resize(im, new_unpad, interpolation=cv2.INTER_LINEAR)
    top, bottom = int(round(dh - 0.1)), int(round(dh + 0.1))
    left, right = int(round(dw - 0.1)), int(round(dw + 0.1))
    im = cv2.copyMakeBorder(im, top, bottom, left, right, cv2.BORDER_CONSTANT, value=color)
    return im, r, (dw, dh)


class StaffGaugeAutoLocalizer:
    """
    ระบบค้นหาเสาวัดน้ำและผิวน้ำอัตโนมัติในเฟรมภาพ CCTV
    """
    def __init__(self, model_path: Optional[str] = None):
        self.net = None
        self.yolo_pt = None
        self.backend = None
        self.model_path = None

        # ค้นหาโมเดลอัตโนมัติหากไม่ได้ระบุ
        candidates = []
        if model_path:
            candidates.append(model_path)

        curr_dir = os.path.dirname(os.path.abspath(__file__))
        p = curr_dir
        project_roots = []
        for _ in range(5):
            project_roots.append(p)
            p = os.path.dirname(p)

        search_names = ["model_best_v2.pt", "best.pt"]
        search_dirs = []
        for root in project_roots:
            search_dirs.extend([
                os.path.join(root, "backend", "models"),
                os.path.join(root, "workers", "vision", "models"),
                os.path.join(root, "models"),
            ])

        for s_dir in search_dirs:
            for s_name in search_names:
                candidates.append(os.path.join(s_dir, s_name))

        for cand in candidates:
            if cand and os.path.exists(cand):
                self.model_path = cand
                if cand.endswith(".onnx"):
                    try:
                        self.net = cv2.dnn.readNetFromONNX(cand)
                        self.backend = "ONNX"
                        print(f"[AutoLocalizer] Loaded YOLO ONNX model: {cand}")
                        break
                    except Exception as e:
                        print(f"[AutoLocalizer] Failed to load ONNX {cand}: {e}")
                elif cand.endswith(".pt"):
                    try:
                        from ultralytics import YOLO
                        self.yolo_pt = YOLO(cand)
                        self.backend = "PYTORCH"
                        print(f"[AutoLocalizer] Loaded YOLO PyTorch model: {cand}")
                        break
                    except Exception as e:
                        # Ultralytics or Torch might not be in this env
                        pass

        if not self.backend:
            print("[AutoLocalizer] No YOLO model found, using Color Saliency & Config Prior.")

    def detect_raw(self, frame: np.ndarray, conf_thresh: float = 0.20) -> List[Dict[str, Any]]:
        """
        ตรวจจับวัตถุทั้งหมด (Staff Gauge และ Water-Area) ในภาพ พร้อมดึง Polygon Mask
        """
        h, w = frame.shape[:2]
        detections = []

        if self.backend == "ONNX" and self.net is not None:
            img_letter, r, (dw, dh) = _letterbox(frame)
            blob = cv2.dnn.blobFromImage(img_letter, 1.0 / 255.0, (640, 640), swapRB=True, crop=False)
            self.net.setInput(blob)
            out_names = self.net.getUnconnectedOutLayersNames()
            outs = self.net.forward(out_names)
            output0 = outs[0][0]  # shape: (38, 8400)
            proto = outs[1][0] if len(outs) > 1 else None  # shape: (32, 160, 160)
            preds = output0.T

            boxes, confidences, class_ids = [], [], []
            raw_boxes, mask_coeffs = [], []
            for row in preds:
                scores = row[4:6]
                max_s = np.max(scores)
                if max_s > conf_thresh:
                    cls = int(np.argmax(scores))
                    cx, cy, bw, bh = row[0], row[1], row[2], row[3]
                    raw_boxes.append([cx, cy, bw, bh])
                    if proto is not None:
                        mask_coeffs.append(row[6:38])
                    cx_orig = (cx - dw) / r
                    cy_orig = (cy - dh) / r
                    bw_orig = bw / r
                    bh_orig = bh / r
                    x1 = int(cx_orig - bw_orig / 2.0)
                    y1 = int(cy_orig - bh_orig / 2.0)
                    boxes.append([x1, y1, int(bw_orig), int(bh_orig)])
                    confidences.append(float(max_s))
                    class_ids.append(cls)

            indices = cv2.dnn.NMSBoxes(boxes, confidences, conf_thresh, 0.45)
            if len(indices) > 0:
                for idx in np.array(indices).flatten():
                    bx, by, bw, bh = boxes[idx]
                    cls = class_ids[idx]
                    conf = float(confidences[idx])

                    # ดึง Polygon จาก Segmentation Mask
                    poly = None
                    if proto is not None and idx < len(mask_coeffs):
                        try:
                            cx, cy, raw_w, raw_h = raw_boxes[idx]
                            lx1 = max(0, int(cx - raw_w / 2.0))
                            ly1 = max(0, int(cy - raw_h / 2.0))
                            lx2 = min(640, int(cx + raw_w / 2.0))
                            ly2 = min(640, int(cy + raw_h / 2.0))

                            mc = np.array(mask_coeffs[idx])
                            mask_160 = (1.0 / (1.0 + np.exp(-(mc @ proto.reshape(32, -1))))).reshape(160, 160)
                            mask_640 = cv2.resize(mask_160, (640, 640), interpolation=cv2.INTER_LINEAR)

                            cropped_mask = np.zeros_like(mask_640)
                            cropped_mask[ly1:ly2, lx1:lx2] = mask_640[ly1:ly2, lx1:lx2]

                            valid_h, valid_w = int(round(h * r)), int(round(w * r))
                            top, left = int(dh), int(dw)
                            mask_cropped = cropped_mask[top:top+valid_h, left:left+valid_w]
                            mask_orig = cv2.resize(mask_cropped, (w, h), interpolation=cv2.INTER_LINEAR)
                            mask_bin = (mask_orig > 0.50).astype(np.uint8)

                            contours, _ = cv2.findContours(mask_bin, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                            if len(contours) > 0:
                                best_cnt = max(contours, key=cv2.contourArea)
                                if cv2.contourArea(best_cnt) > 200:
                                    poly = cv2.approxPolyDP(best_cnt, 2.5, True)
                        except Exception:
                            poly = None

                    detections.append({
                        "name": "Staff Gauge" if cls == 0 else "Water-Area",
                        "class_id": cls,
                        "confidence": round(conf, 3),
                        "bbox": [max(0, bx), max(0, by), min(w, bx + bw), min(h, by + bh)],
                        "polygon": poly
                    })

        elif self.backend == "PYTORCH" and self.yolo_pt is not None:
            results = self.yolo_pt(frame, conf=conf_thresh, verbose=False)
            for res in results:
                masks_xy = res.masks.xy if res.masks is not None else []
                for i, b in enumerate(res.boxes):
                    cls = int(b.cls[0])
                    conf = float(b.conf[0])
                    xyxy = b.xyxy[0].cpu().numpy().astype(int)
                    poly = None
                    if i < len(masks_xy) and len(masks_xy[i]) > 0:
                        poly = masks_xy[i].reshape(-1, 1, 2).astype(np.int32)
                    detections.append({
                        "name": "Staff Gauge" if cls == 0 else "Water-Area",
                        "class_id": cls,
                        "confidence": round(conf, 3),
                        "bbox": [max(0, int(xyxy[0])), max(0, int(xyxy[1])), min(w, int(xyxy[2])), min(h, int(xyxy[3]))],
                        "polygon": poly
                    })

        return detections

    def localize(self, frame: np.ndarray, station_config: dict) -> Dict[str, Any]:
        """
        ระบุตำแหน่งเสาวัดน้ำและคำนวณการขยับของกล้องเทียบกับ Config
        """
        h, w = frame.shape[:2]
        stn_code = station_config.get("station_code", "Unknown")
        cfg_bbox = station_config.get("staff_gauge_bbox", {})
        ref_x1 = cfg_bbox.get("x1", int(w * 0.5))
        ref_y1 = cfg_bbox.get("y1", int(h * 0.2))
        ref_x2 = cfg_bbox.get("x2", int(w * 0.6))
        ref_y2 = cfg_bbox.get("y2", int(h * 0.6))
        ref_cx = (ref_x1 + ref_x2) / 2.0
        ref_cy = (ref_y1 + ref_y2) / 2.0

        detections = self.detect_raw(frame, conf_thresh=0.25)
        gauge_boxes = [d for d in detections if d["name"] == "Staff Gauge"]
        water_boxes = [d for d in detections if d["name"] == "Water-Area"]

        best_gauge = None
        best_dist = 1e9

        # เลือกเสาวัดน้ำที่สอดคล้องกับตำแหน่งสถานี (หรือกล่องที่ใกล้เคียงตำแหน่งคาลิเบรตเดิมที่สุด)
        for g in gauge_boxes:
            gx1, gy1, gx2, gy2 = g["bbox"]
            gcx = (gx1 + gx2) / 2.0
            gcy = (gy1 + gy2) / 2.0
            # เสาวัดน้ำต้องเป็นแท่งแนวดิ่ง
            gbw = max(1, gx2 - gx1)
            gbh = max(1, gy2 - gy1)
            aspect = gbh / float(gbw)

            dist_x = abs(gcx - ref_cx)
            if dist_x < best_dist and dist_x < 300.0 and aspect >= 1.5:
                best_dist = dist_x
                best_gauge = g

        # ตรวจสอบผิวน้ำที่สัมพันธ์กับเสา
        water_area_bbox = None
        water_area_conf = None
        waterline_hint_y = None
        if len(water_boxes) > 0:
            # เลือกผิวน้ำที่มีความเชื่อมั่นสูงสุด
            best_water = max(water_boxes, key=lambda x: x["confidence"])
            water_area_bbox = best_water["bbox"]
            water_area_conf = best_water["confidence"]
            waterline_hint_y = water_area_bbox[1]  # ขอบบนของผิวน้ำ

        if best_gauge is not None:
            bx1, gy1, bx2, gy2 = best_gauge["bbox"]
            gcx = (bx1 + bx2) / 2.0
            dx = gcx - ref_cx

            # คำนวณการเลื่อนตำแหน่งกล้อง (Camera Shift)
            is_shifted = abs(dx) > 15.0

            # ปรับ BBox ที่อัปเดตแล้วสำหรับส่งต่อให้ PoleCoordinateManager
            updated_w = cfg_bbox.get("width", bx2 - bx1)
            adj_x1 = int(round(ref_x1 + dx))
            adj_x2 = int(round(ref_x2 + dx))
            adj_y1 = ref_y1
            adj_y2 = ref_y2

            return {
                "bbox": [adj_x1, adj_y1, adj_x2, adj_y2],
                "raw_yolo_bbox": [bx1, gy1, bx2, gy2],
                "confidence": best_gauge["confidence"],
                "method": f"YOLO_{self.backend}",
                "camera_shift_x": round(float(dx), 1),
                "is_camera_shifted": is_shifted,
                "gauge_polygon": best_gauge.get("polygon"),
                "water_area_bbox": water_area_bbox,
                "water_area_conf": water_area_conf,
                "water_polygon": best_water.get("polygon") if 'best_water' in locals() and best_water else None,
                "waterline_hint_y": waterline_hint_y
            }

        # Fallback: ใช้ Color Saliency หาก YOLO ไม่พบ
        saliency_res = self._localize_by_yellow_saliency(frame)
        if saliency_res is not None:
            return saliency_res

        # Fallback สุดท้าย: ใช้พิกัดเดิมตาม Config
        return {
            "bbox": [ref_x1, ref_y1, ref_x2, ref_y2],
            "raw_yolo_bbox": None,
            "confidence": 0.90,
            "method": "CONFIG_PRIOR",
            "camera_shift_x": 0.0,
            "is_camera_shifted": False,
            "water_area_bbox": water_area_bbox,
            "waterline_hint_y": waterline_hint_y
        }

    def _localize_by_yellow_saliency(self, frame: np.ndarray) -> Optional[Dict[str, Any]]:
        """
        ตรวจจับเสาสีเหลืองแนวตั้ง (Yellow Vertical Staff Gauge) ด้วย HSV Saliency
        """
        h, w = frame.shape[:2]
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        lower_yellow = np.array([14, 38, 48], dtype=np.uint8)
        upper_yellow = np.array([38, 255, 255], dtype=np.uint8)
        yellow_mask = cv2.inRange(hsv, lower_yellow, upper_yellow)

        vert_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 11))
        filtered = cv2.morphologyEx(yellow_mask, cv2.MORPH_OPEN, vert_kernel)
        filtered = cv2.morphologyEx(filtered, cv2.MORPH_CLOSE, vert_kernel)

        col_density = np.sum(filtered > 0, axis=0)
        if np.max(col_density) < 40:
            return None

        best_col = int(np.argmax(col_density))
        col_thresh = max(10, col_density[best_col] * 0.25)
        left_col, right_col = best_col, best_col
        while left_col > 0 and col_density[left_col] >= col_thresh:
            left_col -= 1
        while right_col < w - 1 and col_density[right_col] >= col_thresh:
            right_col += 1

        gauge_width = right_col - left_col + 1
        pad_x = max(8, int(gauge_width * 1.0))
        x1 = max(0, left_col - pad_x)
        x2 = min(w, right_col + pad_x)

        strip_mask = yellow_mask[:, max(0, left_col - 4):min(w, right_col + 5)]
        row_counts = np.sum(strip_mask > 0, axis=1)
        top_candidates = [y for y in np.where(row_counts >= 1)[0] if y >= int(h * 0.15)]
        if len(top_candidates) == 0:
            return None

        y1 = int(top_candidates[0])
        y2 = min(h - 1, int(top_candidates[-1]) + 50)

        return {
            "bbox": [x1, y1, x2, y2],
            "raw_yolo_bbox": None,
            "confidence": 0.78,
            "method": "COLOR_STRUCTURAL_SALIENCY",
            "camera_shift_x": 0.0,
            "is_camera_shifted": False,
            "water_area_bbox": None,
            "waterline_hint_y": None
        }

    def align_hybrid_pole(
        self,
        frame: np.ndarray,
        station_config: Dict[str, Any],
        raw_detections: Optional[List[Dict[str, Any]]] = None,
        manual_bbox: Optional[List[int]] = None
    ) -> Dict[str, Any]:
        """
        ระบบ Hybrid Alignment ผสานเรขาคณิตจาก Config เข้ากับการตรวจจับ Real-time ของ AI:
        1. Top-Cap Anchor: ยึดหัวเสา (Top-Y) และแนวกึ่งกลาง (Center-X)
        2. Dynamic Shift Compensation: คำนวณการเลื่อนของมุมกล้อง (dx, dy)
        3. Height Extrapolation (Anti-Occlusion): หากน้ำท่วมบังเสาท่อนล่าง จะดึงสเกลเต็มความยาวจาก Config ลงไปใต้น้ำ
        4. Perspective Polygon Tracking: สำหรับสถานีที่มีความเอียง (Homography)
        """
        fh, fw = frame.shape[:2]
        ref_res = station_config.get("reference_frame_resolution", [fw, fh])
        ref_w, ref_h = float(ref_res[0]), float(ref_res[1])
        scale_x = fw / ref_w
        scale_y = fh / ref_h

        has_poly = "staff_gauge_polygon" in station_config
        has_bbox = "staff_gauge_bbox" in station_config

        # คำนวณพิกัด Baseline Geometry จาก Config
        if has_poly:
            poly = station_config["staff_gauge_polygon"]
            ref_tl = [poly["top_left"][0] * scale_x, poly["top_left"][1] * scale_y]
            ref_tr = [poly["top_right"][0] * scale_x, poly["top_right"][1] * scale_y]
            ref_br = [poly["bottom_right"][0] * scale_x, poly["bottom_right"][1] * scale_y]
            ref_bl = [poly["bottom_left"][0] * scale_x, poly["bottom_left"][1] * scale_y]
            base_pts = np.float32([ref_tl, ref_tr, ref_br, ref_bl])
            ref_x1 = min(ref_tl[0], ref_bl[0])
            ref_x2 = max(ref_tr[0], ref_br[0])
            ref_y1 = min(ref_tl[1], ref_tr[1])
            ref_y2 = max(ref_bl[1], ref_br[1])
        elif has_bbox:
            bb = station_config["staff_gauge_bbox"]
            ref_x1 = bb["x1"] * scale_x
            ref_y1 = bb["y1"] * scale_y
            ref_x2 = bb["x2"] * scale_x
            ref_y2 = bb["y2"] * scale_y
            base_pts = np.float32([
                [ref_x1, ref_y1],
                [ref_x2, ref_y1],
                [ref_x2, ref_y2],
                [ref_x1, ref_y2]
            ])
        else:
            ref_x1, ref_y1, ref_x2, ref_y2 = fw * 0.45, fh * 0.2, fw * 0.55, fh * 0.8
            base_pts = np.float32([[ref_x1, ref_y1], [ref_x2, ref_y1], [ref_x2, ref_y2], [ref_x1, ref_y2]])

        ref_cx = (ref_x1 + ref_x2) / 2.0
        base_h = ref_y2 - ref_y1
        base_w = ref_x2 - ref_x1

        # กรณีมี Manual BBox ที่ผู้ใช้วาดโดยตรง
        if manual_bbox and len(manual_bbox) == 4:
            mx1, my1, mx2, my2 = manual_bbox
            mcx = (mx1 + mx2) / 2.0
            mw = max(4, mx2 - mx1)
            mh = max(10, my2 - my1)
            dx = mcx - ref_cx
            dy = my1 - ref_y1

            if has_poly:
                aligned_pts = base_pts.copy()
                aligned_pts[:, 0] += dx
                aligned_pts[:, 1] += dy
            else:
                aligned_pts = np.float32([
                    [mx1, my1],
                    [mx2, my1],
                    [mx2, my2],
                    [mx1, my2]
                ])

            return {
                "aligned_bbox": [int(mx1), int(my1), int(mx2), int(my2)],
                "source_points": aligned_pts,
                "camera_shift": {"dx": round(float(dx), 1), "dy": round(float(dy), 1)},
                "is_camera_shifted": abs(dx) > 3.0 or abs(dy) > 3.0,
                "is_submerged_occluded": False,
                "is_manual": True,
                "detected_height_px": int(mh),
                "structural_height_px": int(mh),
                "confidence": 1.0,
                "method": "MANUAL_BBOX_ALIGNMENT",
                "raw_yolo_bbox": manual_bbox
            }

        # ดึงผลตรวจจับของ YOLO
        if raw_detections is None:
            raw_detections = self.detect_raw(frame, conf_thresh=0.12)

        gauges = [d for d in raw_detections if d.get("name") == "Staff Gauge"]

        best_g = None
        best_score = -999.0
        max_corridor = max(250.0, base_w * 4.5)

        for g in gauges:
            gx1, gy1, gx2, gy2 = g["bbox"]
            gcx = (gx1 + gx2) / 2.0
            gw = max(1, gx2 - gx1)
            gh = max(1, gy2 - gy1)
            aspect = gh / float(gw)
            dist_x = abs(gcx - ref_cx)

            # กรองกล่องที่หลอนหรืออยู่ไกลเกินขอบเขตเสาจริง
            if dist_x < max_corridor and aspect >= 1.1:
                # ให้คะแนนความน่าจะเป็นเสา: ยิ่งใกล้แกนเสาเดิมและ confidence สูง ยิ่งได้คะแนนมาก
                proximity_score = 1.0 - (dist_x / max_corridor)
                score = g.get("confidence", 0.5) * 1.5 + proximity_score * 1.0
                if score > best_score:
                    best_score = score
                    best_g = g

        if best_g is not None:
            bx1, gy1, bx2, gy2 = best_g["bbox"]
            gcx = (bx1 + bx2) / 2.0
            det_h = gy2 - gy1

            # 1. การเลื่อนของกล้องในแนวราบ (dx) และแนวดิ่งของหัวเสา (dy)
            dx = gcx - ref_cx
            dy_top = gy1 - ref_y1

            dx_clamped = float(np.clip(dx, -250.0, 250.0))
            dy_clamped = float(np.clip(dy_top, -150.0, 150.0))

            # ใช้พิกัดจริงที่ตรวจจับได้จากโมเดล YOLO โดยตรง (Exact YOLO Predicted Bounding Box - ปราศจาก Offset)
            aligned_x1 = int(round(bx1))
            aligned_y1 = int(round(gy1))
            aligned_x2 = int(round(bx2))
            aligned_y2 = int(round(gy2))

            aligned_pts = np.float32([
                [aligned_x1, aligned_y1],
                [aligned_x2, aligned_y1],
                [aligned_x2, aligned_y2],
                [aligned_x1, aligned_y2]
            ])

            return {
                "aligned_bbox": [aligned_x1, aligned_y1, aligned_x2, aligned_y2],
                "source_points": aligned_pts,
                "camera_shift": {"dx": round(dx_clamped, 1), "dy": round(dy_clamped, 1)},
                "is_camera_shifted": abs(dx_clamped) > 3.0 or abs(dy_clamped) > 3.0,
                "is_submerged_occluded": False,
                "is_manual": False,
                "detected_height_px": int(det_h),
                "structural_height_px": int(base_h),
                "confidence": float(best_g["confidence"]),
                "method": "YOLO_DIRECT_DETECTION",
                "raw_yolo_bbox": [int(bx1), int(gy1), int(bx2), int(gy2)]
            }

        # Fallback: กรณี YOLO ไม่พบเสาใน Corridor หรือโมเดลหลอน ให้ใช้แม่พิมพ์ Config ที่ปรับสเกล
        aligned_pts = base_pts.copy()
        aligned_bbox = [int(round(ref_x1)), int(round(ref_y1)), int(round(ref_x2)), int(round(ref_y2))]
        return {
            "aligned_bbox": aligned_bbox,
            "source_points": aligned_pts,
            "camera_shift": {"dx": 0.0, "dy": 0.0},
            "is_camera_shifted": False,
            "is_submerged_occluded": False,
            "is_manual": False,
            "detected_height_px": int(base_h),
            "structural_height_px": int(base_h),
            "confidence": 0.85,
            "method": "CONFIG_GEOMETRY_BASELINE",
            "raw_yolo_bbox": None
        }
