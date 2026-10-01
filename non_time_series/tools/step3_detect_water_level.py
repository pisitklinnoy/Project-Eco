"""
Step 3: Water Surface Contact Detection & Full Dashboard Generator
ตรวจจับจุดตัดผิวน้ำ คำนวณระดับน้ำจริง (m R.T.K.)
บันทึกผลลง water_levels.xlsx อัตโนมัติ
และสร้างภาพ Monitoring Dashboard แสดงภาพรวมกล้อง CCTV + เสาขยาย + ไม้บรรทัดดิจิทัล
"""

import os
import sys
import argparse
import json
import cv2
import numpy as np

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from core.pole_coordinates import PoleCoordinateManager
from core.scale_calibrator import PiecewiseScaleCalibrator
from core.water_surface_detector import WaterSurfaceDetector
from core.excel_logger import WaterLevelExcelLogger

CONFIG_MAP = {
    "muangkong": os.path.join(BASE_DIR, "configs", "station1_muangkong.json"),
    "bangsala": os.path.join(BASE_DIR, "configs", "station2_bangsala.json"),
    "hatyainai": os.path.join(BASE_DIR, "configs", "station3_hatyainai.json")
}

DEFAULT_IMAGES = {
    "muangkong": os.path.join(BASE_DIR, "sample_images", "station1_muangkong.jpg"),
    "bangsala": os.path.join(BASE_DIR, "sample_images", "station2_bangsala.png"),
    "hatyainai": os.path.join(BASE_DIR, "sample_images", "station3_hatyainai_daytime.jpg")
}


def build_dashboard(frame, enhanced_gauge, water_info, pole_mgr, calibrator, cfg, image_path):
    """ประกอบภาพ Dashboard แบบ 3 แผงตามมาตรฐานระบบ"""
    h_orig, w_orig = frame.shape[:2]
    cctv_panel = frame.copy()

    # 1. วาดกรอบเสาบนภาพ CCTV
    src_pts = pole_mgr.last_pts_src.astype(np.int32)
    cv2.polylines(cctv_panel, [src_pts], isClosed=True, color=(0, 255, 255), thickness=2)

    # 2. วาดเส้นผิวน้ำบนภาพ CCTV ด้วย Inverse Homography (M^-1)
    water_y = water_info["water_y"]
    w_enh = enhanced_gauge.shape[1]

    # คำนวณพิกัดเส้นผิวน้ำบนแม่น้ำ
    fx_left, fy_left = pole_mgr.transform_gauge_to_cctv(0, water_y)
    fx_right, fy_right = pole_mgr.transform_gauge_to_cctv(w_enh, water_y)

    # ขยายเส้นแนวนอนผิวน้ำบนแม่น้ำให้เห็นชัดเจน
    extend_w = 40.0
    dx = fx_right - fx_left
    dy = fy_right - fy_left
    length = max(1e-3, np.hypot(dx, dy))
    ux, uy = dx / length, dy / length

    p1 = (int(round(fx_left - extend_w * ux)), int(round(fy_left - extend_w * uy)))
    p2 = (int(round(fx_right + extend_w * ux)), int(round(fy_right + extend_w * uy)))

    cv2.line(cctv_panel, p1, p2, (0, 140, 255), 3, cv2.LINE_AA)
    cv2.circle(cctv_panel, (int(round(fx_right)), int(round(fy_right))), 5, (0, 0, 255), -1)

    # 3. วาดเสาขยายพร้อมไม้บรรทัดดิจิทัล
    gauge_with_water = enhanced_gauge.copy()
    h_enh = gauge_with_water.shape[0]
    cv2.line(gauge_with_water, (0, water_y), (w_enh - 1, water_y), (0, 140, 255), 3)

    warn_m = cfg.get("warning_thresholds", {}).get("warning_m")
    crit_m = cfg.get("warning_thresholds", {}).get("critical_flood_m")
    ruler = calibrator.render_digital_ruler(height=h_enh, width=140,
                                           current_level=water_info["water_level"],
                                           warning_lvl=warn_m, critical_lvl=crit_m)

    left_panel = np.hstack([gauge_with_water, ruler])

    # 4. ปรับขนาด Panel ให้เข้ากัน (สเกลความสูง Dashboard มาตรฐาน 720px)
    target_dashboard_h = 720
    aspect_left = left_panel.shape[1] / float(left_panel.shape[0])
    w_left_target = int(round(target_dashboard_h * aspect_left))
    left_resized = cv2.resize(left_panel, (w_left_target, target_dashboard_h), interpolation=cv2.INTER_AREA)

    aspect_cctv = cctv_panel.shape[1] / float(cctv_panel.shape[0])
    w_cctv_target = int(round(target_dashboard_h * aspect_cctv))
    cctv_resized = cv2.resize(cctv_panel, (w_cctv_target, target_dashboard_h), interpolation=cv2.INTER_AREA)

    content_panel = np.hstack([left_resized, cctv_resized])

    # 5. สร้าง Header Banner
    header_h = 70
    total_w = content_panel.shape[1]
    header = np.full((header_h, total_w, 3), (25, 35, 45), dtype=np.uint8)

    # สีสถานะ
    status = water_info["status"]
    if status == "CRITICAL_FLOOD":
        status_color = (40, 40, 230)
    elif status == "WARNING_LEVEL":
        status_color = (30, 160, 255)
    else:
        status_color = (60, 180, 75)

    title_text = f"HATYAI FLOOD CAMERA - {cfg.get('thai_name')} [{cfg.get('station_code')}]"
    cv2.putText(header, title_text, (20, 32), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 255), 2, cv2.LINE_AA)

    level_text = f"WATER LEVEL: {water_info['water_level']:.2f} m R.T.K. [{status}]  (CONF: {water_info['confidence']*100:.1f}%)"
    cv2.putText(header, level_text, (20, 58), cv2.FONT_HERSHEY_SIMPLEX, 0.60, status_color, 2, cv2.LINE_AA)

    dashboard = np.vstack([header, content_panel])
    return dashboard


def main():
    parser = argparse.ArgumentParser(description="Step 3: Detect Water Level & Build Dashboard")
    parser.add_argument("--station", type=str, default="hatyainai", choices=["muangkong", "bangsala", "hatyainai"])
    parser.add_argument("--image", type=str, default=None, help="Path to CCTV image")
    parser.add_argument("--output", type=str, default=None, help="Output dashboard image path")
    parser.add_argument("--no_excel", action="store_true", help="Skip logging to Excel")
    args = parser.parse_args()

    cfg_path = CONFIG_MAP[args.station]
    with open(cfg_path, "r", encoding="utf-8") as f:
        cfg = json.load(f)

    img_path = args.image if args.image else DEFAULT_IMAGES[args.station]
    if not os.path.exists(img_path):
        print(f"❌ Input image not found: {img_path}")
        return

    frame = cv2.imread(img_path)
    if frame is None:
        print(f"❌ Failed to decode image: {img_path}")
        return

    pole_mgr = PoleCoordinateManager(cfg)
    rectified, enhanced, pts_src = pole_mgr.extract_and_rectify(frame)

    calibrator = PiecewiseScaleCalibrator(cfg.get("piecewise_anchors", []))
    detector = WaterSurfaceDetector(calibrator, cfg)

    water_info = detector.detect_waterline(enhanced)

    # สกัด Timestamp
    timestamp = WaterLevelExcelLogger.extract_timestamp_from_path(img_path)

    # บันทึกลง Excel
    if not args.no_excel:
        excel_path = os.path.join(BASE_DIR, "water_levels.xlsx")
        logger = WaterLevelExcelLogger(excel_path)
        logger.log_water_level(cfg.get("station_name"), water_info["water_level"], timestamp)

    # ประกอบ Dashboard
    dashboard = build_dashboard(frame, enhanced, water_info, pole_mgr, calibrator, cfg, img_path)

    out_path = args.output if args.output else os.path.join(BASE_DIR, "output", f"{args.station}_dashboard_result.jpg")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    cv2.imwrite(out_path, dashboard)

    print("=" * 70)
    print(f"🌊 ผลการตรวจจับระดับน้ำ: สถานี {cfg.get('thai_name')} ({cfg.get('station_code')})")
    print(f"📷 ภาพตรวจวัด: {os.path.basename(img_path)}")
    print(f"🕒 Timestamp: {timestamp}")
    print(f"📏 ระดับน้ำคำนวณได้: {water_info['water_level']:.2f} m R.T.K. [{water_info['status']}]")
    print(f"🎯 ค่าความเชื่อมั่น: {water_info['confidence']*100:.1f}%")
    print(f"📊 บันทึกลง Excel: {os.path.join(BASE_DIR, 'water_levels.xlsx')}")
    print(f"💾 บันทึกภาพ Dashboard ที่: {out_path}")
    print("=" * 70)


if __name__ == "__main__":
    main()
