"""
Pipeline: Run Water Level Detection for Station 2 - Bangsala Bridge (สถานีสะพานบางศาลา X.90)
รันตรวจวัดระดับน้ำสำหรับสถานีสะพานบางศาลา
"""

import os
import sys
import argparse
import json
import cv2

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from tools.step3_detect_water_level import build_dashboard
from core.pole_coordinates import PoleCoordinateManager
from core.scale_calibrator import PiecewiseScaleCalibrator
from core.water_surface_detector import WaterSurfaceDetector
from core.excel_logger import WaterLevelExcelLogger
from core.auto_localizer import StaffGaugeAutoLocalizer

CFG_PATH = os.path.join(BASE_DIR, "configs", "station2_bangsala.json")
DEFAULT_IMG = os.path.join(BASE_DIR, "sample_images", "station2_bangsala.png")


def main():
    parser = argparse.ArgumentParser(description="Run Station 2: Bangsala (X.90)")
    parser.add_argument("--image", type=str, default=None, help="Path to input image")
    parser.add_argument("--night", action="store_true", help="Use nighttime sample image")
    parser.add_argument("--output", type=str, default=None, help="Path to save output dashboard")
    parser.add_argument("--no_excel", action="store_true", help="Skip logging to Excel")
    args = parser.parse_args()

    with open(CFG_PATH, "r", encoding="utf-8") as f:
        cfg = json.load(f)

    if args.image:
        img_input = args.image
    elif args.night:
        img_input = os.path.join(BASE_DIR, "sample_images", "station2_bangsala_nighttime.jpg")
    else:
        img_input = os.path.join(BASE_DIR, "sample_images", "station2_bangsala_daytime.jpg")

    if not os.path.exists(img_input):
        print(f"❌ Input image not found: {img_input}")
        return
    frame = cv2.imread(img_input)
    img_src_name = os.path.basename(img_input)

    # 1. Stage 1: YOLO Segmentation & Auto-Localizer (ตรวจจับเสาและผิวน้ำก่อนเป็นด่านแรก)
    localizer = StaffGaugeAutoLocalizer()
    loc_res = localizer.localize(frame, cfg)
    if loc_res.get("is_camera_shifted", False):
        bx1, by1, bx2, by2 = loc_res["bbox"]
        print(f"📷 [Camera Shift] ตรวจพบกล้องขยับ ปรับพิกัดเสา X: {cfg['staff_gauge_bbox']['x1']} -> {bx1} (Shift: {loc_res['camera_shift_x']}px)")
        cfg["staff_gauge_bbox"]["x1"] = bx1
        cfg["staff_gauge_bbox"]["x2"] = bx2

    pole_mgr = PoleCoordinateManager(cfg)
    rectified, enhanced, pts_src = pole_mgr.extract_and_rectify(frame)
    calibrator = PiecewiseScaleCalibrator(cfg.get("piecewise_anchors", []))
    detector = WaterSurfaceDetector(calibrator, cfg)

    water_info = detector.detect_waterline(enhanced)
    timestamp = WaterLevelExcelLogger.extract_timestamp_from_path(img_src_name)

    if not args.no_excel:
        excel_path = os.path.join(BASE_DIR, "water_levels.xlsx")
        logger = WaterLevelExcelLogger(excel_path)
        logger.log_water_level("Bangsala_X90", water_info["water_level"], timestamp)

    dashboard = build_dashboard(frame, enhanced, water_info, pole_mgr, calibrator, cfg, img_src_name, yolo_info=loc_res)
    os.makedirs(os.path.join(BASE_DIR, "output"), exist_ok=True)
    if args.output:
        out_path = args.output
    elif args.night or "night" in img_src_name.lower():
        out_path = os.path.join(BASE_DIR, "output", "result_bangsala_nighttime.jpg")
    else:
        out_path = os.path.join(BASE_DIR, "output", "result_bangsala_daytime_normal.jpg")
    cv2.imwrite(out_path, dashboard)

    print("=" * 70)
    print(f"🌊 [Station 2] สะพานบางศาลา (X.90)")
    print(f"📷 ภาพ: {img_src_name}")
    print(f"🕒 Timestamp: {timestamp}")
    print(f"🤖 YOLO Stage-1: {loc_res.get('method')} (Conf: {loc_res.get('confidence')*100:.1f}%)")
    if loc_res.get("raw_yolo_bbox"):
        print(f"🎯 YOLO Staff Gauge BBox: {loc_res['raw_yolo_bbox']}")
    if loc_res.get("water_area_bbox"):
        print(f"💧 YOLO Water Area BBox: {loc_res['water_area_bbox']}")
    print(f"📏 ระดับน้ำ: {water_info['water_level']:.2f} m R.T.K. [{water_info['status']}]")
    print(f"🎯 ความเชื่อมั่นรวม: {water_info['confidence']*100:.1f}%")
    print(f"💾 Dashboard: {out_path}")
    print("=" * 70)


if __name__ == "__main__":
    main()
