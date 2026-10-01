import os
import io
import time
import json
import urllib.request
from typing import Dict, Any, Optional, Tuple
import numpy as np
import cv2
from PIL import Image, ImageFile

ImageFile.LOAD_TRUNCATED_IMAGES = True

from core.vision.pole_coordinates import PoleCoordinateManager
from core.vision.scale_calibrator import PiecewiseScaleCalibrator
from core.vision.water_surface_detector import WaterSurfaceDetector

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
    "STN-HATYAINAI": "https://hatyaicityclimate.org/floodphoto/last/hatyainai.jpg",
}


class VisionService:
    def __init__(self):
        self.station_components: Dict[str, Dict[str, Any]] = {}
        self._cached_dashboards: Dict[str, Tuple[float, bytes]] = {}  # {code: (timestamp, jpeg_bytes)}
        self._cached_metadata: Dict[str, Tuple[float, Dict[str, Any]]] = {}
        self.cache_ttl_seconds = 15.0
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

                    self.station_components[code] = {
                        "config": cfg,
                        "pole_mgr": pole_mgr,
                        "calibrator": calibrator,
                        "detector": detector,
                    }
                except Exception as e:
                    print(f"[VisionService] Error loading config {cfg_path}: {e}")

    def _resolve_station_key(self, station_code: str) -> Optional[str]:
        stn_key = str(station_code).strip().upper()
        if stn_key in self.station_components:
            return stn_key
        for k in self.station_components.keys():
            if k in stn_key or stn_key in k:
                return k
        return None

    def fetch_live_frame(self, station_code: str) -> Optional[np.ndarray]:
        """ดึงภาพสดจากกล้อง CCTV ของสถานีแบบเรียลไทม์"""
        norm_key = "STN-MUANGKONG" if "MUANGKONG" in station_code.upper() else \
                   "STN-BANGSALA" if "BANGSALA" in station_code.upper() else \
                   "STN-HATYAINAI" if "HATYAINAI" in station_code.upper() else None
        
        stream_url = STATION_STREAM_MAP.get(norm_key, None)
        if not stream_url:
            return None

        try:
            req = urllib.request.Request(
                stream_url,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) FloodLens/1.0"}
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                img_data = resp.read()

            pil_img = Image.open(io.BytesIO(img_data)).convert("RGB")
            frame = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
            return frame
        except Exception as e:
            print(f"[VisionService] Failed to fetch live frame for {station_code}: {e}")
            return None

    def get_realtime_analysis_dashboard(self, station_code: str) -> Optional[bytes]:
        """
        ประมวลผลภาพกล้อง CCTV สดแบบ Realtime
        - Crop เสาวัดน้ำจากภาพสด
        - วาดไม้บรรทัดดิจิทัลสเกล ม. รทก.
        - วาดกรอบ Bounding Box และเส้นผิวน้ำตัดผ่านบนภาพสด
        - สร้างแดชบอร์ดตามรูปที่แนบมา
        """
        stn_key = self._resolve_station_key(station_code)
        if not stn_key:
            return None

        # Check Cache
        now = time.time()
        if stn_key in self._cached_dashboards:
            cached_time, cached_bytes = self._cached_dashboards[stn_key]
            if now - cached_time < self.cache_ttl_seconds:
                return cached_bytes

        mgr = self.station_components[stn_key]
        cfg = mgr["config"]
        pole_mgr: PoleCoordinateManager = mgr["pole_mgr"]
        calibrator: PiecewiseScaleCalibrator = mgr["calibrator"]
        detector: WaterSurfaceDetector = mgr["detector"]

        frame = self.fetch_live_frame(station_code)
        if frame is None:
            # Fallback to sample image if stream is unreachable
            sample_candidates = [
                os.path.join(BASE_DIR, "..", "workers", "vision", "sample_images", f"{cfg.get('station_name', '').lower()}.jpg"),
                os.path.join(BASE_DIR, "..", "workers", "vision", "sample_images", f"station1_muangkong.jpg")
            ]
            for p in sample_candidates:
                if os.path.exists(p):
                    frame = cv2.imread(p)
                    if frame is not None:
                        break

        if frame is None:
            return None

        try:
            # 1. ตัดและดัดภาพเสาให้ตรง (Homography Rectification + Contrast Enhancement)
            rectified, enhanced, pts_src = pole_mgr.extract_and_rectify(frame)

            # 2. ตรวจหาจุดสัมผัสผิวน้ำ
            water_info = detector.detect_waterline(enhanced)

            # 3. ประกอบภาพแดชบอร์ดแบบ 2 ฝั่ง (ซ้าย: เสา Rectified + ไม้บรรทัด, ขวา: CCTV พร้อมกรอบและเส้นผิวน้ำ)
            h_orig, w_orig = frame.shape[:2]
            cctv_panel = frame.copy()

            # วาดกรอบเสาบนภาพ CCTV
            src_pts = pole_mgr.last_pts_src.astype(np.int32)
            cv2.polylines(cctv_panel, [src_pts], isClosed=True, color=(0, 255, 0), thickness=3)

            # ใส่ข้อความกำกับที่กรอบเสา
            pt_top = src_pts[0]
            cv2.putText(
                cctv_panel,
                f"Staff Gauge: {water_info['confidence']*100:.0f}%",
                (int(pt_top[0]) - 20, max(25, int(pt_top[1]) - 12)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (0, 255, 0),
                2,
                cv2.LINE_AA
            )

            # วาดเส้นผิวน้ำบนภาพ CCTV ด้วย Inverse Homography (M^-1)
            water_y = water_info["water_y"]
            w_enh = enhanced.shape[1]
            fx_left, fy_left = pole_mgr.transform_gauge_to_cctv(0, water_y)
            fx_right, fy_right = pole_mgr.transform_gauge_to_cctv(w_enh, water_y)

            extend_w = 60.0
            dx = fx_right - fx_left
            dy = fy_right - fy_left
            length = max(1e-3, np.hypot(dx, dy))
            ux, uy = dx / length, dy / length

            p1 = (int(round(fx_left - extend_w * ux)), int(round(fy_left - extend_w * uy)))
            p2 = (int(round(fx_right + extend_w * ux)), int(round(fy_right + extend_w * uy)))

            # เส้นผิวน้ำสีส้มสะท้อนแสง
            cv2.line(cctv_panel, p1, p2, (0, 140, 255), 4, cv2.LINE_AA)
            cv2.circle(cctv_panel, (int(round(fx_right)), int(round(fy_right))), 7, (0, 0, 255), -1)

            # วาดเสาขยายพร้อมไม้บรรทัดดิจิทัล
            gauge_with_water = enhanced.copy()
            h_enh = gauge_with_water.shape[0]
            cv2.line(gauge_with_water, (0, water_y), (w_enh - 1, water_y), (0, 140, 255), 4)

            warn_m = cfg.get("warning_thresholds", {}).get("warning_m")
            crit_m = cfg.get("warning_thresholds", {}).get("critical_flood_m")
            ruler = calibrator.render_digital_ruler(
                height=h_enh,
                width=150,
                current_level=water_info["water_level"],
                warning_lvl=warn_m,
                critical_lvl=crit_m
            )

            left_panel = np.hstack([gauge_with_water, ruler])

            # สเกลความสูง Dashboard มาตรฐาน 720px
            target_dashboard_h = 720
            aspect_left = left_panel.shape[1] / float(left_panel.shape[0])
            w_left_target = int(round(target_dashboard_h * aspect_left))
            left_resized = cv2.resize(left_panel, (w_left_target, target_dashboard_h), interpolation=cv2.INTER_AREA)

            aspect_cctv = cctv_panel.shape[1] / float(cctv_panel.shape[0])
            w_cctv_target = int(round(target_dashboard_h * aspect_cctv))
            cctv_resized = cv2.resize(cctv_panel, (w_cctv_target, target_dashboard_h), interpolation=cv2.INTER_AREA)

            content_panel = np.hstack([left_resized, cctv_resized])

            # Header Banner
            header_h = 70
            total_w = content_panel.shape[1]
            header = np.full((header_h, total_w, 3), (25, 35, 45), dtype=np.uint8)

            status = water_info["status"]
            if status == "CRITICAL_FLOOD":
                status_color = (40, 40, 230)
            elif status == "WARNING_LEVEL":
                status_color = (30, 160, 255)
            else:
                status_color = (60, 180, 75)

            title_text = f"HATYAI REALTIME FLOOD AI - {cfg.get('thai_name')} [{cfg.get('station_code')}]"
            cv2.putText(header, title_text, (20, 32), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 255), 2, cv2.LINE_AA)

            level_text = f"REALTIME WATER LEVEL: {water_info['water_level']:.2f} m R.T.K. [{status}]  (CONF: {water_info['confidence']*100:.1f}%)"
            cv2.putText(header, level_text, (20, 58), cv2.FONT_HERSHEY_SIMPLEX, 0.60, status_color, 2, cv2.LINE_AA)

            dashboard = np.vstack([header, content_panel])

            # Encode JPEG
            ret, buf = cv2.imencode(".jpg", dashboard, [cv2.IMWRITE_JPEG_QUALITY, 85])
            if ret:
                jpeg_bytes = buf.tobytes()
                self._cached_dashboards[stn_key] = (now, jpeg_bytes)
                return jpeg_bytes

        except Exception as e:
            print(f"[VisionService] Dashboard processing error: {e}")

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


vision_service = VisionService()
