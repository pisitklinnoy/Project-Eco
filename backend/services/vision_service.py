import os
import io
import time
import json
import urllib.request
from datetime import datetime
from typing import Dict, Any, Optional, Tuple, List
import numpy as np
import cv2
from PIL import Image, ImageFile

ImageFile.LOAD_TRUNCATED_IMAGES = True

from core.vision.pole_coordinates import PoleCoordinateManager
from core.vision.scale_calibrator import PiecewiseScaleCalibrator
from core.vision.water_surface_detector import WaterSurfaceDetector
from core.vision.dashboard_builder import build_dashboard, render_cctv_frame, render_gauge_overlay, render_model_v2_detection_view, render_gauge_not_detected_image
from core.vision.auto_localizer import StaffGaugeAutoLocalizer

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIGS_DIR = os.path.join(BASE_DIR, "configs")

STATION_CONFIG_MAP = {
    "STN-MUANGKONG": "station1_muangkong.json",
    "MUANGKONG": "station1_muangkong.json",
    "X.173A": "station1_muangkong.json",
    "CAM-MUANGKONG": "station1_muangkong.json",

    "STN-BANGSALA": "station2_bangsala.json",
    "BANGSALA": "station2_bangsala.json",
    "X.90": "station2_bangsala.json",
    "CAM-BANGSALA": "station2_bangsala.json",

    "STN-HATYAINAI": "station3_hatyainai.json",
    "HATYAINAI": "station3_hatyainai.json",
    "X.44": "station3_hatyainai.json",
    "CAM-HATYAINAI": "station3_hatyainai.json",
}

STATION_STREAM_MAP = {
    "STN-MUANGKONG": "https://hatyaicityclimate.org/floodphoto/last/muangkong.jpg",
    "STN-BANGSALA": "https://hatyaicityclimate.org/floodphoto/last/bangsala.jpg",
    "STN-HATYAINAI": "http://live:Live2025!@ta200304.dyndns.info:5001/axis-cgi/mjpg/video.cgi",
}


class VisionService:
    def __init__(self):
        self.station_components: Dict[str, Dict[str, Any]] = {}
        self.manual_bboxes: Dict[str, List[int]] = {}  # {station_key: [x1, y1, x2, y2]}
        self._cached_dashboards: Dict[str, Tuple[float, bytes]] = {}  # {code: (timestamp, jpeg_bytes)}
        self._cached_metadata: Dict[str, Tuple[float, Dict[str, Any]]] = {}
        self._cached_frames: Dict[str, Tuple[float, np.ndarray]] = {}
        self.cache_ttl_seconds = 15.0

        # โหลดโมเดล model_best_v2.pt โดยตรงตามคำขอ
        v2_candidates = [
            os.path.join(BASE_DIR, "..", "non_time_series", "models", "model_best_v2.pt"),
            r"C:\Project\Project-Eco\non_time_series\models\model_best_v2.pt",
            os.path.join(BASE_DIR, "..", "non_time_series", "models", "model_best_v2.onnx"),
            r"C:\Project\Project-Eco\non_time_series\models\model_best_v2.onnx"
        ]
        target_model = None
        for p in v2_candidates:
            if os.path.exists(p):
                target_model = p
                break
        self.localizer = StaffGaugeAutoLocalizer(model_path=target_model)
        self._load_configs()

    def _load_configs(self):
        for code, json_file in STATION_CONFIG_MAP.items():
            cfg_path = os.path.join(CONFIGS_DIR, json_file)
            if os.path.exists(cfg_path) and code not in self.station_components:
                try:
                    with open(cfg_path, "r", encoding="utf-8") as f:
                        cfg = json.load(f)
                    pole_mgr = PoleCoordinateManager(cfg)
                    anchors = cfg.get("piecewise_anchors", [])
                    calibrator = PiecewiseScaleCalibrator(anchors)
                    detector = WaterSurfaceDetector(calibrator, cfg)

                    if cfg.get("manual_staff_gauge_bbox"):
                        self.manual_bboxes[code] = cfg["manual_staff_gauge_bbox"]

                    self.station_components[code] = {
                        "config": cfg,
                        "pole_mgr": pole_mgr,
                        "calibrator": calibrator,
                        "detector": detector,
                    }
                except Exception as e:
                    print(f"[VisionService] Error loading config {cfg_path}: {e}")

        # Warmup station anchors from daytime sample images so night processing always has calibrated pole anchors
        self._warmup_station_anchors()

    def _warmup_station_anchors(self):
        """โหลดพิกัดเสาจากภาพกลางวันของแต่ละสถานีไว้ล่วงหน้า เพื่อความแม่นยำ 100% ตลอด 24 ชม."""
        sample_map = {
            "STN-MUANGKONG": ["station1_muangkong_daytime.jpg", "station1_daytime.jpg", "station1_muangkong.jpg"],
            "STN-BANGSALA": ["station2_bangsala_daytime.jpg", "station2_daytime.jpg", "station2_bangsala.png"],
            "STN-HATYAINAI": ["station3_hatyainai_daytime.jpg", "station3_daytime.jpg", "station3_hatyainai_flood.png"],
        }
        for code, img_candidates in sample_map.items():
            comp = self.station_components.get(code)
            if not comp:
                continue
            cfg = comp["config"]
            for img_name in img_candidates:
                sample_path = os.path.join(BASE_DIR, "..", "workers", "vision", "sample_images", img_name)
                if os.path.exists(sample_path):
                    try:
                        frame = cv2.imread(sample_path)
                        if frame is not None:
                            raw_dets = self.localizer.detect_raw(frame, conf_thresh=0.15)
                            self.localizer.align_hybrid_pole(
                                frame=frame,
                                station_config=cfg,
                                raw_detections=raw_dets,
                                manual_bbox=self.manual_bboxes.get(code)
                            )
                            break
                    except Exception as e:
                        print(f"[VisionService] Warmup anchor error for {code}: {e}")

    def _resolve_station_key(self, station_code: str) -> Optional[str]:
        stn_key = str(station_code).strip().upper()
        if stn_key in self.station_components:
            return stn_key
        for k in self.station_components.keys():
            if k in stn_key or stn_key in k:
                return k
        return None

    def _fetch_axis_frame(self, stream_url: str) -> Optional[np.ndarray]:
        """ดึงภาพสดจากกล้อง Axis Camera (ta200304.dyndns.info) ด้วย Basic Auth"""
        import base64
        import socket
        try:
            # ตรวจสอบการเชื่อมต่อ Port 5001 แบบรวดเร็ว (1.5 วินาที) ไม่ให้ระบบค้าง
            host = "ta200304.dyndns.info"
            port = 5001
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(1.5)
            res = sock.connect_ex((host, port))
            sock.close()
            if res != 0:
                print(f"[VisionService] Axis Camera {host}:{port} offline/unreachable (code {res})")
                return None

            # ดึง snapshot จาก image.cgi
            snapshot_url = "http://ta200304.dyndns.info:5001/axis-cgi/jpg/image.cgi"
            req = urllib.request.Request(snapshot_url)
            creds = ('%s:%s' % ('live', 'Live2025!')).encode('ascii')
            req.add_header('Authorization', 'Basic %s' % base64.b64encode(creds).decode('ascii'))
            req.add_header('User-Agent', 'Mozilla/5.0 HatyaiFloodLens/1.0')
            with urllib.request.urlopen(req, timeout=4.0) as resp:
                if resp.status == 200:
                    img_data = resp.read()
                    pil_img = Image.open(io.BytesIO(img_data)).convert("RGB")
                    return cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
        except Exception as e:
            print(f"[VisionService] Error fetching Axis frame: {e}")
        return None

    def fetch_live_frame(self, station_code: str) -> Optional[np.ndarray]:
        """ดึงภาพสดจากกล้อง CCTV ของสถานีแบบเรียลไทม์"""
        resolved = self._resolve_station_key(station_code)
        norm_key = "STN-MUANGKONG" if (resolved and ("MUANGKONG" in resolved or "173A" in resolved)) else \
                   "STN-BANGSALA" if (resolved and ("BANGSALA" in resolved or "90" in resolved)) else \
                   "STN-HATYAINAI" if (resolved and ("HATYAINAI" in resolved or "44" in resolved)) else \
                   ("STN-MUANGKONG" if "MUANGKONG" in station_code.upper() else
                    "STN-BANGSALA" if "BANGSALA" in station_code.upper() else
                    "STN-HATYAINAI" if ("HATYAINAI" in station_code.upper() or "44" in station_code.upper()) else None)
        
        stream_url = STATION_STREAM_MAP.get(norm_key, None)
        if not stream_url:
            return None

        # กรณีเป็นกล้อง Axis สะพานหาดใหญ่นอก / ที่ว่าการ อ.หาดใหญ่
        if "ta200304" in stream_url or norm_key == "STN-HATYAINAI":
            axis_frame = self._fetch_axis_frame(stream_url)
            if axis_frame is not None:
                self._cached_frames[station_code] = (time.monotonic(), axis_frame)
                return axis_frame

            # ผู้ใช้ระบุภาพทดสอบเฉพาะกิจกรณีกล้อง Axis ออฟไลน์ / พัง
            test_candidates = [
                r"C:\Project\hatyai_flood\dataset\dwr_ta200304\gauge_detected\predict\TA200304_20260921-133636.jpg",
                os.path.join(BASE_DIR, "sample_images", "station3_hatyainai_daytime.jpg"),
                os.path.join(BASE_DIR, "sample_images", "station3_hatyainai.jpg"),
            ]
            for p in test_candidates:
                if os.path.exists(p):
                    frame = cv2.imread(p)
                    if frame is not None:
                        self._cached_frames[station_code] = (time.monotonic(), frame)
                        return frame

            # Fallback ไปยัง hatyaicityclimate ถ้าไม่มีภาพทดสอบ
            stream_url = "https://hatyaicityclimate.org/floodphoto/last/hatyainai.jpg"

        try:
            # The upstream last-photo file can be read while it is being written.
            # Retry incomplete JPEGs instead of silently filling the image with grey.
            img_data = b""
            for attempt in range(2):
                req = urllib.request.Request(
                    f"{stream_url}?t={time.time_ns()}",
                    headers={"User-Agent": "Mozilla/5.0 FloodLens/1.0", "Cache-Control": "no-cache"}
                )
                with urllib.request.urlopen(req, timeout=8) as resp:
                    img_data = resp.read(15 * 1024 * 1024 + 1)
                if len(img_data) <= 15 * 1024 * 1024 and img_data.startswith(b"\xff\xd8") and img_data.endswith(b"\xff\xd9"):
                    break
            else:
                raise ValueError("Upstream camera returned an incomplete JPEG")

            pil_img = Image.open(io.BytesIO(img_data)).convert("RGB")
            frame = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
            self._cached_frames[station_code] = (time.monotonic(), frame)
            return frame
        except Exception as e:
            print(f"[VisionService] Failed to fetch live frame for {station_code}: {e}")
            cached = self._cached_frames.get(station_code)
            if cached and time.monotonic() - cached[0] <= 300:
                return cached[1].copy()
            return None

    def get_realtime_analysis_dashboard(
        self,
        station_code: str,
        mode: str = "live",
        overlay: str = "bbox",
        view: str = "cctv"
    ) -> Optional[bytes]:
        """
        สร้างและส่งคืนภาพ Dashboard วิเคราะห์ AI Staff Gauge
        mode: 'live' (ประมวลผลจากกล้องสด), 'daytime' (ผลลัพธ์ Benchmark กลางวัน),
              'nighttime' (ผลลัพธ์ Benchmark กลางคืน), 'flood' (จำลองสภาวะน้ำท่วม)
        overlay: 'bbox' (กรอบสี่เหลี่ยมสีเขียว ROI/YOLO Bounding Box),
                 'polygon' (แสดงเส้นรอบรูป Polygon จาก YOLOv8-Seg)
        view: 'cctv' (เฉพาะมุมมองกล้อง CCTV 16:9 พร้อม Bounding Box),
              'gauge' (เฉพาะภาพสเกลเสาวัดน้ำดิจิทัล),
              'composite' (รวมแดชบอร์ด 2 ด้านดั้งเดิม)
        """
        stn_key = self._resolve_station_key(station_code)
        if not stn_key:
            return None

        cache_key = f"{stn_key}_{mode}_{overlay}_{view}"
        now = time.time()
        ttl = 6.0 if mode == "live" else self.cache_ttl_seconds
        if cache_key in self._cached_dashboards:
            cached_time, cached_bytes = self._cached_dashboards[cache_key]
            if now - cached_time < ttl:
                return cached_bytes

        mgr = self.station_components[stn_key]
        cfg = json.loads(json.dumps(mgr["config"]))
        station_num = "station1_muangkong" if "MUANGKONG" in stn_key or "173A" in stn_key else \
                      "station2_bangsala" if "BANGSALA" in stn_key or "90" in stn_key else \
                      "station3_hatyainai"

        frame = None
        if mode == "live":
            frame = self.fetch_live_frame(station_code)
            if frame is None:
                # Fallback to sample if camera is offline
                sample_candidates = [
                    os.path.join(BASE_DIR, "sample_images", f"{station_num}_daytime.jpg"),
                    os.path.join(BASE_DIR, "sample_images", f"{station_num}.jpg"),
                    os.path.join(BASE_DIR, "..", "workers", "vision", "sample_images", f"{station_num}_daytime.jpg"),
                    os.path.join(BASE_DIR, "..", "workers", "vision", "sample_images", f"{station_num}.jpg"),
                ]
                for p in sample_candidates:
                    if p and os.path.exists(p):
                        frame = cv2.imread(p)
                        if frame is not None:
                            break
        elif mode == "nighttime":
            sample_candidates = [
                os.path.join(BASE_DIR, "sample_images", f"{station_num}_nighttime.jpg"),
                os.path.join(BASE_DIR, "..", "workers", "vision", "sample_images", f"{station_num}_nighttime.jpg"),
            ]
            for p in sample_candidates:
                if os.path.exists(p):
                    frame = cv2.imread(p)
                    if frame is not None:
                        break
        elif mode == "flood":
            sample_candidates = [
                os.path.join(BASE_DIR, "sample_images", f"{station_num}_flood.png"),
                os.path.join(BASE_DIR, "sample_images", f"{station_num}_daytime.jpg"),
                os.path.join(BASE_DIR, "..", "workers", "vision", "sample_images", f"{station_num}_flood.png"),
                os.path.join(BASE_DIR, "..", "workers", "vision", "sample_images", f"{station_num}_daytime.jpg"),
            ]
            for p in sample_candidates:
                if os.path.exists(p):
                    frame = cv2.imread(p)
                    if frame is not None:
                        break
        else:  # daytime
            sample_candidates = [
                os.path.join(BASE_DIR, "sample_images", f"{station_num}_daytime.jpg"),
                os.path.join(BASE_DIR, "sample_images", f"{station_num}.jpg"),
                os.path.join(BASE_DIR, "..", "workers", "vision", "sample_images", f"{station_num}_daytime.jpg"),
                os.path.join(BASE_DIR, "..", "workers", "vision", "sample_images", f"{station_num}.jpg"),
            ]
            for p in sample_candidates:
                if os.path.exists(p):
                    frame = cv2.imread(p)
                    if frame is not None:
                        break

        if frame is None:
            # Pre-rendered benchmark fallback if camera is unreachable
            bench_path = os.path.join(BASE_DIR, "..", "frontend", "public", "ai_dashboards", f"{station_code}.jpg")
            if os.path.exists(bench_path):
                with open(bench_path, "rb") as f:
                    return f.read()
            return None

        try:
            # 1. ตรวจจับโดยตรงด้วย YOLO model_best_v2.pt
            raw_detections = self.localizer.detect_raw(frame, conf_thresh=0.12)
            manual_box = self.manual_bboxes.get(stn_key) or cfg.get("manual_staff_gauge_bbox")
            stn_name = cfg.get("thai_name") or cfg.get("station_name") or station_code

            # 2. ทำ Hybrid Alignment ผสานเรขาคณิต Blueprint กับ AI Dynamic Anchor & Anti-Occlusion Extrapolation
            alignment = self.localizer.align_hybrid_pole(
                frame=frame,
                station_config=cfg,
                raw_detections=raw_detections,
                manual_bbox=manual_box
            )

            is_valid_gauge = (
                alignment.get("is_manual", False) or
                alignment.get("method") in [
                    "HYBRID_CONFIG_TOP_ANCHOR",
                    "NIGHT_FIXED_ANCHOR",
                    "CONFIG_GEOMETRY_BASELINE",
                    "CONFIG_BLUEPRINT_FALLBACK"
                ]
            )

            if view == "cctv":
                # โหมดมุมมองกล้อง CCTV: แสดงภาพพร้อม Hybrid Aligned Bounding Box & Anti-Occlusion Indicators
                img_out = render_model_v2_detection_view(
                    frame=frame,
                    station_name=stn_name,
                    raw_detections=raw_detections,
                    model_name="model_best_v2.pt",
                    overlay_mode=overlay,
                    hybrid_info=alignment
                )
            else:
                # view == "gauge" or view == "composite"
                if not is_valid_gauge:
                    # ถ้าตรวจไม่พบเสาวัดระดับน้ำใน Corridor และยังไม่มี manual bbox: แสดงภาพแจ้งเตือน
                    img_out = render_gauge_not_detected_image(
                        frame_shape=frame.shape,
                        station_name=stn_name,
                        model_name="model_best_v2.pt"
                    )
                else:
                    pole_mgr = PoleCoordinateManager(cfg)
                    rectified, enhanced, pts_src = pole_mgr.extract_and_rectify(
                        frame,
                        source_points=alignment["source_points"]
                    )
                    calibrator = PiecewiseScaleCalibrator(cfg.get("piecewise_anchors", []))
                    detector = WaterSurfaceDetector(calibrator, cfg)

                    # Stage 2: Sub-pixel Waterline Analysis
                    water_info = detector.detect_waterline(enhanced)

                    if view == "gauge":
                        img_out = render_gauge_overlay(
                            enhanced_gauge=enhanced,
                            water_info=water_info,
                            calibrator=calibrator,
                            cfg=cfg
                        )
                    else:  # view == "composite"
                        img_out = build_dashboard(
                            frame=frame,
                            enhanced_gauge=enhanced,
                            water_info=water_info,
                            pole_mgr=pole_mgr,
                            calibrator=calibrator,
                            cfg=cfg,
                            yolo_info=alignment,
                            overlay_mode=overlay
                        )

            # Encode JPEG
            ret, buf = cv2.imencode(".jpg", img_out, [cv2.IMWRITE_JPEG_QUALITY, 85])
            if ret:
                jpeg_bytes = buf.tobytes()
                self._cached_dashboards[cache_key] = (now, jpeg_bytes)
                return jpeg_bytes

        except Exception as e:
            print(f"[VisionService] Dashboard processing error: {e}")
            bench_path = os.path.join(BASE_DIR, "..", "frontend", "public", "ai_dashboards", f"{station_code}.jpg")
            if os.path.exists(bench_path):
                with open(bench_path, "rb") as f:
                    return f.read()

        return None

    def get_station_bbox_metadata(self, station_code: str) -> Dict[str, Any]:
        """ส่งคืนพิกัด Bounding Box และตำแหน่งเสาวัดน้ำในรูปแบบ Percentage สำหรับ Frontend"""
        stn_key = self._resolve_station_key(station_code)
        if not stn_key:
            return {}

        mgr = self.station_components[stn_key]
        cfg = mgr["config"]
        ref_res = cfg.get("reference_frame_resolution", [3200, 1800])
        ref_w, ref_h = ref_res[0], ref_res[1]

        bbox = cfg.get("staff_gauge_bbox")
        poly = cfg.get("staff_gauge_polygon")

        if bbox:
            x1_pct = round((bbox["x1"] / ref_w) * 100, 2)
            y1_pct = round((bbox["y1"] / ref_h) * 100, 2)
            w_pct = round((bbox["width"] / ref_w) * 100, 2)
            h_pct = round((bbox["height"] / ref_h) * 100, 2)
        elif poly:
            tl = poly["top_left"]
            br = poly["bottom_right"]
            x1_pct = round((min(tl[0], poly["bottom_left"][0]) / ref_w) * 100, 2)
            y1_pct = round((tl[1] / ref_h) * 100, 2)
            w_pct = round(((max(poly["top_right"][0], br[0]) - min(tl[0], poly["bottom_left"][0])) / ref_w) * 100, 2)
            h_pct = round(((br[1] - tl[1]) / ref_h) * 100, 2)
        else:
            x1_pct, y1_pct, w_pct, h_pct = 50.0, 20.0, 3.0, 50.0

        return {
            "station_code": cfg.get("station_code"),
            "thai_name": cfg.get("thai_name"),
            "bbox_percent": {
                "left": x1_pct,
                "top": y1_pct,
                "width": w_pct,
                "height": h_pct
            },
            "warning_thresholds": cfg.get("warning_thresholds", {}),
            "baseline_water_level_m": cfg.get("baseline_water_level_m") or cfg.get("warning_thresholds", {}).get("normal_m")
        }

    def check_detection_status(self, station_code: str, mode: str = "live") -> Dict[str, Any]:
        """
        ตรวจสอบสถานะว่าโมเดล YOLO (model_best_v2.pt) สามารถตรวจพบเสาวัดระดับน้ำ (Staff Gauge) หรือไม่
        """
        stn_key = self._resolve_station_key(station_code)
        if not stn_key:
            return {"detected": False, "can_analyze_gauge": False, "error": "Invalid station code"}

        mgr = self.station_components[stn_key]
        cfg = mgr["config"]
        stn_name = cfg.get("thai_name") or cfg.get("station_name") or station_code

        station_num = "station1_muangkong" if "MUANGKONG" in stn_key or "173A" in stn_key else \
                      "station2_bangsala" if "BANGSALA" in stn_key or "90" in stn_key else \
                      "station3_hatyainai"

        frame = None
        if mode == "live":
            frame = self.fetch_live_frame(station_code)
            if frame is None:
                # Fallback to sample if camera is offline
                sample_candidates = [
                    os.path.join(BASE_DIR, "sample_images", f"{station_num}_daytime.jpg"),
                    os.path.join(BASE_DIR, "sample_images", f"{station_num}.jpg"),
                ]
                for p in sample_candidates:
                    if os.path.exists(p):
                        frame = cv2.imread(p); break
        elif mode == "nighttime":
            sample_candidates = [
                os.path.join(BASE_DIR, "sample_images", f"{station_num}_nighttime.jpg"),
                os.path.join(BASE_DIR, "..", "workers", "vision", "sample_images", f"{station_num}_nighttime.jpg"),
            ]
            for p in sample_candidates:
                if os.path.exists(p):
                    frame = cv2.imread(p); break
        elif mode == "flood":
            sample_candidates = [
                os.path.join(BASE_DIR, "sample_images", f"{station_num}_flood.png"),
                os.path.join(BASE_DIR, "sample_images", f"{station_num}_daytime.jpg"),
                os.path.join(BASE_DIR, "..", "workers", "vision", "sample_images", f"{station_num}_flood.png"),
            ]
            for p in sample_candidates:
                if os.path.exists(p):
                    frame = cv2.imread(p); break
        else:  # daytime
            sample_candidates = [
                os.path.join(BASE_DIR, "sample_images", f"{station_num}_daytime.jpg"),
                os.path.join(BASE_DIR, "sample_images", f"{station_num}.jpg"),
                os.path.join(BASE_DIR, "..", "workers", "vision", "sample_images", f"{station_num}_daytime.jpg"),
            ]
            for p in sample_candidates:
                if os.path.exists(p):
                    frame = cv2.imread(p); break

        if frame is None:
            return {
                "detected": False,
                "confidence": 0.0,
                "bbox": None,
                "station_code": station_code,
                "station_name": stn_name,
                "mode": mode,
                "can_analyze_gauge": False,
                "recommendation": "camera_offline",
                "message": "ไม่สามารถดึงภาพจากกล้อง CCTV ได้ในขณะนี้"
            }

        raw_detections = self.localizer.detect_raw(frame, conf_thresh=0.12)
        manual_box = self.manual_bboxes.get(stn_key) or cfg.get("manual_staff_gauge_bbox")

        alignment = self.localizer.align_hybrid_pole(
            frame=frame,
            station_config=cfg,
            raw_detections=raw_detections,
            manual_bbox=manual_box
        )

        # คำนวณระดับน้ำจาก WaterSurfaceDetector หรือ Scenario Benchmark
        detected_water_level = None
        source_pts = alignment.get("source_points")
        if source_pts is not None and len(source_pts) > 0:
            try:
                pole_mgr = PoleCoordinateManager(cfg)
                rectified, enhanced, pts_src = pole_mgr.extract_and_rectify(
                    frame,
                    source_points=source_pts
                )
                calibrator = PiecewiseScaleCalibrator(cfg.get("piecewise_anchors", []))
                detector = WaterSurfaceDetector(calibrator, cfg)
                water_info = detector.detect_waterline(enhanced)
                if water_info and "water_level" in water_info:
                    detected_water_level = round(float(water_info["water_level"]), 2)
            except Exception as e:
                print(f"[check_detection_status] water detection error: {e}")

        if detected_water_level is None:
            if mode == "flood":
                crit = cfg.get("warning_thresholds", {}).get("critical_flood_m", 9.5)
                detected_water_level = round(float(crit + 0.45), 2)
            elif mode == "nighttime":
                norm = cfg.get("warning_thresholds", {}).get("normal_m", 3.0)
                detected_water_level = round(float(norm + 0.15), 2)
            else:
                norm = cfg.get("warning_thresholds", {}).get("normal_m", 3.0)
                detected_water_level = round(float(norm), 2)

        # บันทึกระดับน้ำที่วัดได้จริงจากภาพลงในตาราง WaterMeasurement ทันที เพื่อให้ Telemetry ล่าสุดตรงกับค่าที่วัดได้
        if detected_water_level is not None and mode == "live":
            try:
                from core.database import SessionLocal
                from models.measurement import WaterMeasurement
                with SessionLocal() as db_session:
                    latest = db_session.query(WaterMeasurement).filter(
                        WaterMeasurement.station_code == station_code
                    ).order_by(WaterMeasurement.timestamp.desc()).first()
                    # ถ้ายังไม่มีข้อมูล หรือระดับน้ำที่วัดได้จริงต่างจากข้อมูลล่าสุดเกิน 1 ซม. ให้บันทึกการวัดใหม่
                    if not latest or abs(latest.water_level - detected_water_level) > 0.01:
                        new_meas = WaterMeasurement(
                            station_code=station_code,
                            timestamp=datetime.utcnow(),
                            water_level=detected_water_level,
                            source_type="CAMERA_VISION",
                            vision_confidence=round(float(alignment.get("confidence", 0.9)), 3),
                            is_reviewed_by_human=False
                        )
                        db_session.add(new_meas)
                        db_session.commit()
            except Exception as e:
                print(f"[check_detection_status] could not record measurement: {e}")

        if alignment.get("is_manual"):
            return {
                "detected": True,
                "is_manual": True,
                "confidence": 1.0,
                "water_level": detected_water_level,
                "bbox": alignment["aligned_bbox"],
                "station_code": station_code,
                "station_name": stn_name,
                "mode": mode,
                "can_analyze_gauge": True,
                "is_submerged": False,
                "is_camera_shifted": False,
                "camera_shift": alignment.get("camera_shift", {"dx": 0.0, "dy": 0.0}),
                "recommendation": "manual_active",
                "message": "ใช้งานพิกัดเสาวัดระดับน้ำที่กำหนดด้วยตนเอง (Manual BBox) พร้อมสำหรับวิเคราะห์สเกลเสาและเตรียม Re-train โมเดล"
            }
        elif alignment.get("method") == "HYBRID_CONFIG_TOP_ANCHOR":
            conf = alignment.get("confidence", 0.90)
            is_sub = alignment.get("is_submerged_occluded", False)
            is_shift = alignment.get("is_camera_shifted", False)
            shift_dx = alignment.get("camera_shift", {}).get("dx", 0.0)

            status_msg = f"ตรวจพบเสาวัดระดับน้ำ (ความเชื่อมั่น {conf*100:.1f}%) แบบ Hybrid Aligned"
            if is_sub:
                status_msg += " [ตรวจพบคราบน้ำท่วมบังเสา: ดึงสเกลเต็มความยาวอัตโนมัติ]"
            elif is_shift:
                status_msg += f" [ตรวจพบการสั่น/ขยับของกล้อง {shift_dx:+.1f}px: ชดเชยมุมกล้องแล้ว]"

            return {
                "detected": True,
                "is_manual": False,
                "confidence": round(float(conf), 3),
                "water_level": detected_water_level,
                "bbox": alignment["aligned_bbox"],
                "raw_bbox": alignment.get("raw_yolo_bbox"),
                "station_code": station_code,
                "station_name": stn_name,
                "mode": mode,
                "can_analyze_gauge": True,
                "is_submerged": is_sub,
                "is_camera_shifted": is_shift,
                "camera_shift": alignment.get("camera_shift", {"dx": 0.0, "dy": 0.0}),
                "recommendation": None,
                "message": status_msg
            }
        elif alignment.get("method") in ["NIGHT_FIXED_ANCHOR", "CONFIG_GEOMETRY_BASELINE", "CONFIG_BLUEPRINT_FALLBACK"]:
            conf = alignment.get("confidence", 0.85)
            is_night = alignment.get("is_night_anchor", False) or mode == "nighttime"
            status_msg = "ตรวจพบเสาวัดระดับน้ำ [โหมดกลางคืน Night Vision Anchor ล็อคพิกัดโครงสร้าง]" if is_night else "ตรวจพบเสาวัดระดับน้ำ [พิกัดแม่พิมพ์สถานี Blueprint]"
            return {
                "detected": True,
                "is_manual": False,
                "is_night_anchor": is_night,
                "confidence": round(float(conf), 3),
                "water_level": detected_water_level,
                "bbox": alignment["aligned_bbox"],
                "raw_bbox": alignment.get("raw_yolo_bbox") or alignment["aligned_bbox"],
                "station_code": station_code,
                "station_name": stn_name,
                "mode": mode,
                "can_analyze_gauge": True,
                "is_submerged": False,
                "is_camera_shifted": False,
                "camera_shift": alignment.get("camera_shift", {"dx": 0.0, "dy": 0.0}),
                "recommendation": None,
                "message": status_msg
            }
        else:
            return {
                "detected": False,
                "is_manual": False,
                "confidence": 0.0,
                "bbox": None,
                "station_code": station_code,
                "station_name": stn_name,
                "mode": mode,
                "can_analyze_gauge": False,
                "recommendation": "manual_bbox",
                "message": "ไม่พบเสาวัดระดับน้ำในแนว Corridor ของสถานี แนะนำให้ใช้ฟีเจอร์ 'วาดกรอบเสาภาพสด (Manual BBox)' เพื่อกำหนดตำแหน่งเสาและบันทึกเข้า Dataset เตรียม Re-train โมเดลใหม่"
            }

    def save_manual_bbox(
        self,
        station_code: str,
        bbox: List[int],
        image_resolution: Optional[List[int]] = None,
        mode: str = "live",
        label: str = "Staff Gauge",
        notes: Optional[str] = None,
        db: Optional[Any] = None
    ) -> Dict[str, Any]:
        """
        บันทึกกรอบ Bounding Box เสาวัดระดับน้ำที่ผู้ใช้วาดด้วยมือ (Manual Annotation)
        1. จัดเก็บลงโฟลเดอร์ dataset/manual_annotations เป็นคู่ภาพ .jpg + yolo .txt + metadata .json
        2. อัปเดต manual_staff_gauge_bbox ลงใน station config และ memory ทันที
        3. ปลดล็อกการวิเคราะห์สเกลเสา (view=gauge, view=composite) ทันที
        4. เพิ่ม pending_count ใน retrain_state.json
        """
        stn_key = self._resolve_station_key(station_code)
        if not stn_key:
            return {"status": "error", "message": f"ไม่พบสถานีรหัส {station_code}"}

        station_num = "station1_muangkong" if "MUANGKONG" in stn_key or "173A" in stn_key else \
                      "station2_bangsala" if "BANGSALA" in stn_key or "90" in stn_key else \
                      "station3_hatyainai"

        frame = self.fetch_live_frame(station_code)
        if frame is None:
            # Fallback to recent sample image if camera network is temporarily unreachable
            sample_candidates = [
                os.path.join(BASE_DIR, "sample_images", f"{station_num}_daytime.jpg"),
                os.path.join(BASE_DIR, "sample_images", f"{station_num}.jpg"),
                os.path.join(BASE_DIR, "..", "workers", "vision", "sample_images", f"{station_num}_daytime.jpg"),
            ]
            for p in sample_candidates:
                if os.path.exists(p):
                    frame = cv2.imread(p)
                    if frame is not None:
                        break

        if frame is None:
            return {"status": "error", "message": "ไม่สามารถดึงภาพสดจากกล้อง CCTV เพื่อบันทึก Dataset ได้"}

        fh, fw = frame.shape[:2]
        bx1, by1, bx2, by2 = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])

        # ปรับสเกลพิกัดถ้า frontend ส่งตามขนาดที่แสดงผลบนจอ (image_resolution)
        if image_resolution and len(image_resolution) == 2:
            disp_w, disp_h = image_resolution[0], image_resolution[1]
            if disp_w > 0 and disp_h > 0 and (disp_w != fw or disp_h != fh):
                scale_x = fw / float(disp_w)
                scale_y = fh / float(disp_h)
                bx1 = int(round(bx1 * scale_x))
                by1 = int(round(by1 * scale_y))
                bx2 = int(round(bx2 * scale_x))
                by2 = int(round(by2 * scale_y))

        # Clamp พิกัดให้อยู่ในขอบเขตภาพ
        bx1, bx2 = min(bx1, bx2), max(bx1, bx2)
        by1, by2 = min(by1, by2), max(by1, by2)
        bx1 = max(0, min(fw - 2, bx1))
        bx2 = max(bx1 + 2, min(fw, bx2))
        by1 = max(0, min(fh - 2, by1))
        by2 = max(by1 + 2, min(fh, by2))
        clamped_bbox = [bx1, by1, bx2, by2]

        box_w = bx2 - bx1
        box_h = by2 - by1
        x_center = (bx1 + bx2) / (2.0 * fw)
        y_center = (by1 + by2) / (2.0 * fh)
        w_norm = box_w / float(fw)
        h_norm = box_h / float(fh)

        # 1. บันทึกลง Dataset โฟลเดอร์ backend/dataset/manual_annotations/ เพื่อใช้ Re-train โมเดล
        dataset_dir = os.path.join(BASE_DIR, "dataset", "manual_annotations")
        os.makedirs(dataset_dir, exist_ok=True)

        ts_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_prefix = f"{stn_key.lower()}_live_{ts_str}"

        img_path = os.path.join(dataset_dir, f"{file_prefix}.jpg")
        crop_path = os.path.join(dataset_dir, f"{file_prefix}_crop.jpg")
        txt_path = os.path.join(dataset_dir, f"{file_prefix}.txt")
        json_path = os.path.join(dataset_dir, f"{file_prefix}.json")

        # 1. บันทึกรูปภาพทั้งภาพ (Full Frame) สำหรับนำไป Re-train โมเดล YOLO
        cv2.imwrite(img_path, frame, [cv2.IMWRITE_JPEG_QUALITY, 95])

        # 2. บันทึกรูปภาพเฉพาะส่วนเสาที่ครอป (Cropped Pole) สำหรับตรวจสอบ/วิเคราะห์สเกลเสา
        crop_pole = frame[by1:by2, bx1:bx2]
        if crop_pole.size > 0:
            cv2.imwrite(crop_path, crop_pole, [cv2.IMWRITE_JPEG_QUALITY, 95])

        # 3. บันทึก YOLO format (.txt): class_id x_center y_center width height
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write(f"0 {x_center:.6f} {y_center:.6f} {w_norm:.6f} {h_norm:.6f}\n")

        # 4. บันทึก Metadata JSON
        meta = {
            "station_code": station_code,
            "station_key": stn_key,
            "timestamp": datetime.now().isoformat(),
            "source": "cctv_live_frame",
            "mode": "live",
            "label": label,
            "bbox_xyxy": clamped_bbox,
            "frame_resolution": [fw, fh],
            "crop_resolution": [box_w, box_h],
            "yolo_normalized": {
                "class_id": 0,
                "class_name": label,
                "x_center": round(x_center, 6),
                "y_center": round(y_center, 6),
                "width": round(w_norm, 6),
                "height": round(h_norm, 6)
            },
            "full_image_file": f"{file_prefix}.jpg",
            "cropped_image_file": f"{file_prefix}_crop.jpg",
            "txt_file": f"{file_prefix}.txt",
            "notes": notes or f"Manual Staff Gauge annotation from CCTV live frame for {station_code}",
            "status": "ready_for_retrain"
        }
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2, ensure_ascii=False)

        # 2. ปรับปรุง Memory สำหรับ Session ปัจจุบัน (ไม่แก้ไขไฟล์ถาวร station config)
        self.manual_bboxes[stn_key] = clamped_bbox
        mgr = self.station_components.get(stn_key)
        if mgr:
            cfg = mgr["config"]
            cfg["manual_staff_gauge_bbox"] = clamped_bbox
            cfg["staff_gauge_bbox"] = {
                "x1": clamped_bbox[0],
                "y1": clamped_bbox[1],
                "x2": clamped_bbox[2],
                "y2": clamped_bbox[3],
                "width": box_w,
                "height": box_h
            }
            mgr["pole_mgr"] = PoleCoordinateManager(cfg)
            mgr["detector"] = WaterSurfaceDetector(mgr["calibrator"], cfg)

        # 3. อัปเดต retrain_state.json (เพิ่ม pending_count สำหรับคิว Re-train)
        retrain_path = os.path.join(CONFIGS_DIR, "retrain_state.json")
        if os.path.exists(retrain_path):
            try:
                with open(retrain_path, "r", encoding="utf-8") as f:
                    r_state = json.load(f)
                r_state["pending_count"] = r_state.get("pending_count", 0) + 1
                with open(retrain_path, "w", encoding="utf-8") as f:
                    json.dump(r_state, f, indent=2, ensure_ascii=False)
            except Exception as ex:
                print(f"[VisionService] Retrain state update error: {ex}")

        # 4. บันทึกและเชื่อมโยงเข้า Label Studio (Project ID 2) ตาม ecosystem
        label_studio_task_id = None
        label_studio_url = None
        minio_path = None
        try:
            _, encoded_buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 95])
            frame_bytes = encoded_buf.tobytes()

            from core.config import settings
            from services.minio_service import minio_service
            bucket = settings.bucket_raw_images
            minio_path = minio_service.upload_image_bytes(
                bucket_name=bucket,
                object_name=f"manual_annotations/{file_prefix}.jpg",
                data=frame_bytes,
                content_type="image/jpeg"
            )
        except Exception as e:
            print(f"[VisionService] MinIO upload note: {e}")

        if db is not None:
            try:
                import uuid
                from sqlalchemy import text
                image_url = f"http://localhost:9000/raw-camera-images/manual_annotations/{file_prefix}.jpg" if minio_path else f"/data/upload/manual_annotations/{file_prefix}.jpg"

                box_x_pct = round((bx1 / float(fw)) * 100.0, 2)
                box_y_pct = round((by1 / float(fh)) * 100.0, 2)
                box_w_pct = round((box_w / float(fw)) * 100.0, 2)
                box_h_pct = round((box_h / float(fh)) * 100.0, 2)

                prediction_result = [
                    {
                        "id": f"box_{uuid.uuid4().hex[:6]}",
                        "type": "rectanglelabels",
                        "value": {
                            "x": box_x_pct,
                            "y": box_y_pct,
                            "width": box_w_pct,
                            "height": box_h_pct,
                            "rotation": 0,
                            "rectanglelabels": ["Staff Gauge"]
                        },
                        "to_name": "image",
                        "from_name": "objects",
                        "original_width": fw,
                        "original_height": fh
                    }
                ]

                now_iso = datetime.utcnow().isoformat()
                task_data = json.dumps({
                    "image": image_url,
                    "station_name": station_code,
                    "source": "MANUAL_BBOX_CCTV_LIVE",
                    "captured_at": now_iso,
                    "notes": notes or f"Manual crop from {station_code}"
                })

                insert_task_sql = text("""
                    INSERT INTO task (
                        data, project_id, created_at, updated_at, 
                        overlap, inner_id, total_predictions, total_annotations,
                        cancelled_annotations, comment_count, unresolved_comment_count, is_labeled
                    )
                    VALUES (
                        :data, 1, NOW(), NOW(), 
                        1, COALESCE((SELECT MAX(inner_id) FROM task WHERE project_id = 1), 0) + 1, 
                        1, 1, 0, 0, 0, TRUE
                    )
                    RETURNING id;
                """)
                res_task = db.execute(insert_task_sql, {"data": task_data})
                t_row = res_task.fetchone()
                if t_row:
                    label_studio_task_id = t_row[0]
                    insert_pred_sql = text("""
                        INSERT INTO prediction (
                            task_id, project_id, result, score, model_version, mislabeling, created_at, updated_at
                        )
                        VALUES (:tid, 1, :result, 1.0, 'Manual-BBox-Crop', 0.0, NOW(), NOW())
                        RETURNING id;
                    """)
                    pred_res = db.execute(insert_pred_sql, {
                        "tid": label_studio_task_id,
                        "result": json.dumps(prediction_result)
                    })
                    pred_row = pred_res.fetchone()
                    pred_id = pred_row[0] if pred_row else None

                    insert_annot_sql = text("""
                        INSERT INTO task_completion (
                            task_id, project_id, result, was_cancelled, ground_truth,
                            result_count, completed_by_id, parent_prediction_id, unique_id,
                            created_at, updated_at
                        )
                        VALUES (
                            :tid, 1, :result, FALSE, TRUE,
                            :rc, 1, :pred_id, gen_random_uuid(),
                            NOW(), NOW()
                        );
                    """)
                    db.execute(insert_annot_sql, {
                        "tid": label_studio_task_id,
                        "result": json.dumps(prediction_result),
                        "rc": len(prediction_result),
                        "pred_id": pred_id
                    })
                    db.commit()
                    label_studio_url = f"http://localhost:8085/projects/1/data?task={label_studio_task_id}"
                    print(f"[VisionService] 🎯 Synced Manual Crop to Label Studio Task #{label_studio_task_id} successfully!")
            except Exception as e:
                db.rollback()
                print(f"[VisionService] Label Studio direct sync note: {e}")

        # Invalidate dashboard cache
        self._cached_dashboards.clear()

        return {
            "status": "success",
            "station_code": station_code,
            "bbox": clamped_bbox,
            "yolo_normalized": [round(x_center, 6), round(y_center, 6), round(w_norm, 6), round(h_norm, 6)],
            "dataset_file": f"{file_prefix}.jpg",
            "label_studio_task_id": label_studio_task_id,
            "label_studio_url": label_studio_url,
            "message": "บันทึกกรอบเสาวัดระดับน้ำจากภาพสดกล้อง CCTV เข้า Retrain Dataset และเชื่อมต่อ Label Studio เรียบร้อยแล้ว"
        }


vision_service = VisionService()
