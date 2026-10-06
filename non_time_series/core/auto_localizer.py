"""
Staff Gauge & Water Surface Auto-Localizer Module
ระบบตรวจจับหาตำแหน่งเสาวัดระดับน้ำและผิวน้ำอัตโนมัติด้วย YOLO Segmentation
รองรับ:
1. YOLOv8-Seg via Ultralytics PyTorch (model_best_v2.pt)
2. YOLOv8-Seg via OpenCV DNN (model_best_v2.onnx) - รวดเร็ว ไม่ต้องพึ่งพา PyTorch
3. Color Saliency & Structural Aspect Ratio Fallback (Pure Computer Vision)
4. Dynamic Camera Shift Compensation เมื่อกล้อง CCTV ขยับ/ส่าย/เปลี่ยนมุมมอง
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

        # ค้นหาโมเดลอัตโนมัติหากไม่ได้ระบุ (ให้ความสำคัญกับ model_best_v2.pt และ model_best_v2.onnx ก่อน)
        candidates = []
        if model_path:
            candidates.append(model_path)

        curr_dir = os.path.dirname(os.path.abspath(__file__))
        models_dir = os.path.join(os.path.dirname(curr_dir), "models")
        candidates.extend([
            os.path.join(models_dir, "model_best_v2.pt"),
            os.path.join(models_dir, "model_best_v2.onnx"),
            os.path.join(models_dir, "model_muangkong_seg.pt"),
            os.path.join(models_dir, "model_muangkong_seg.onnx"),
        ])

        # 1. ลองโหลดผ่าน Ultralytics PyTorch ก่อน
        for p in candidates:
            if p.endswith(".pt") and os.path.exists(p):
                try:
                    from ultralytics import YOLO
                    self.yolo_pt = YOLO(p)
                    self.backend = "PYTORCH"
                    self.model_path = p
                    print(f"🤖 [AutoLocalizer] โหลดโมเดล YOLO PyTorch สำเร็จ: {os.path.basename(p)}")
                    break
                except Exception as e:
                    pass

        # 2. ถ้าไม่มี PyTorch หรือโหลด .pt ไม่ได้ ให้โหลด .onnx ผ่าน OpenCV DNN
        if self.backend is None:
            for p in candidates:
                if p.endswith(".onnx") and os.path.exists(p):
                    try:
                        self.net = cv2.dnn.readNetFromONNX(p)
                        self.backend = "OPENCV_ONNX"
                        self.model_path = p
                        print(f"🤖 [AutoLocalizer] โหลดโมเดล YOLO ONNX (OpenCV DNN) สำเร็จ: {os.path.basename(p)}")
                        break
                    except Exception as e:
                        pass

        if self.backend is None:
            print("⚠️ [AutoLocalizer] ไม่สามารถโหลดโมเดล Deep Learning ได้ จะใช้ Color Saliency & Config Fallback แทน")

    def detect_raw(self, frame: np.ndarray, conf_thresh: float = 0.25) -> List[Dict[str, Any]]:
        """
        รันการตรวจจับวัตถุบนภาพต้นฉบับ ส่งคืนรายการ detections
        """
        detections = []
        h, w = frame.shape[:2]

        if self.backend == "PYTORCH" and self.yolo_pt is not None:
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
                    name = self.yolo_pt.names.get(cls, "Staff Gauge" if cls == 0 else "Water-Area")
                    detections.append({
                        "name": name,
                        "class_id": cls,
                        "confidence": round(conf, 3),
                        "bbox": [max(0, int(xyxy[0])), max(0, int(xyxy[1])), min(w, int(xyxy[2])), min(h, int(xyxy[3]))],
                        "polygon": poly
                    })

        elif self.backend == "OPENCV_ONNX" and self.net is not None:
            img, ratio, (dw, dh) = _letterbox(frame, (640, 640))
            blob = cv2.dnn.blobFromImage(img, 1.0 / 255.0, (640, 640), swapRB=True, crop=False)
            self.net.setInput(blob)
            preds = self.net.forward()
            if isinstance(preds, (list, tuple)):
                out = preds[0]
            else:
                out = preds

            if len(out.shape) == 3:
                out = out[0]
            if out.shape[0] < out.shape[1]:
                out = out.T

            boxes = []
            confs = []
            class_ids = []

            for row in out:
                cls_scores = row[4:6]
                cls_id = int(np.argmax(cls_scores))
                conf = float(cls_scores[cls_id])
                if conf >= conf_thresh:
                    cx, cy, bw, bh = row[0:4]
                    x1 = (cx - bw / 2.0 - dw) / ratio
                    y1 = (cy - bh / 2.0 - dh) / ratio
                    x2 = (cx + bw / 2.0 - dw) / ratio
                    y2 = (cy + bh / 2.0 - dh) / ratio

                    x1 = max(0, min(w, int(round(x1))))
                    y1 = max(0, min(h, int(round(y1))))
                    x2 = max(0, min(w, int(round(x2))))
                    y2 = max(0, min(h, int(round(y2))))

                    boxes.append([x1, y1, x2 - x1, y2 - y1])
                    confs.append(conf)
                    class_ids.append(cls_id)

            if len(boxes) > 0:
                indices = cv2.dnn.NMSBoxes(boxes, confs, conf_thresh, 0.45)
                if len(indices) > 0:
                    for idx in indices.flatten():
                        bx, by, bw_b, bh_b = boxes[idx]
                        cls = class_ids[idx]
                        detections.append({
                            "name": "Staff Gauge" if cls == 0 else "Water-Area",
                            "class_id": cls,
                            "confidence": round(float(confs[idx]), 3),
                            "bbox": [bx, by, bx + bw_b, by + bh_b],
                            "polygon": None
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

        detections = self.detect_raw(frame, conf_thresh=0.20)
        gauge_boxes = [d for d in detections if d["name"] == "Staff Gauge"]
        water_boxes = [d for d in detections if d["name"] == "Water-Area"]

        best_gauge = None
        best_dist = 1e9

        # เลือกเสาวัดน้ำที่สอดคล้องกับตำแหน่งสถานี (หรือกล่องที่ใกล้เคียงตำแหน่งคาลิเบรตเดิมที่สุด)
        for g in gauge_boxes:
            gx1, gy1, gx2, gy2 = g["bbox"]
            gcx = (gx1 + gx2) / 2.0
            gcy = (gy1 + gy2) / 2.0
            gbw = max(1, gx2 - gx1)
            gbh = max(1, gy2 - gy1)
            aspect = gbh / float(gbw)

            dist_x = abs(gcx - ref_cx)
            if dist_x < best_dist and dist_x < 350.0 and aspect >= 1.5:
                best_dist = dist_x
                best_gauge = g

        # ตรวจสอบผิวน้ำที่สัมพันธ์กับเสา
        water_area_bbox = None
        water_area_conf = None
        waterline_hint_y = None
        best_water = None
        if len(water_boxes) > 0:
            best_water = max(water_boxes, key=lambda x: x["confidence"])
            water_area_bbox = best_water["bbox"]
            water_area_conf = best_water["confidence"]
            waterline_hint_y = water_area_bbox[1]

        if best_gauge is not None:
            bx1, gy1, bx2, gy2 = best_gauge["bbox"]
            gcx = (bx1 + bx2) / 2.0
            dx = gcx - ref_cx

            # คำนวณการเลื่อนตำแหน่งกล้อง (Camera Shift)
            is_shifted = abs(dx) > 15.0

            # ปรับ BBox ที่อัปเดตแล้วสำหรับส่งต่อให้ PoleCoordinateManager
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
                "water_polygon": best_water.get("polygon") if best_water else None,
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
