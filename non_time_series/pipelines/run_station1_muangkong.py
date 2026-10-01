"""
Pipeline: Run Water Level Detection for Station 1 - Ban Muangkong Bridge (สถานีสะพานบ้านม่วงก็อง X.173A)
รันตรวจวัดระดับน้ำสำหรับสถานีบ้านม่วงก็อง จากรูปภาพหรือกล้องวงจรปิดสด
"""

import os
import sys
import argparse
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

CFG_PATH = os.path.join(BASE_DIR, "configs", "station1_muangkong.json")
DEFAULT_IMG = os.path.join(BASE_DIR, "sample_images", "station1_muangkong.jpg")


def main():
    parser = argparse.ArgumentParser(description="Run Station 1: Ban Muangkong (X.173A)")
    parser.add_argument("--image", type=str, default=None, help="Path to input image")
    parser.add_argument("--night", action="store_true", help="Use nighttime sample image")
    parser.add_argument("--output", type=str, default=None, help="Path to save output dashboard")
    parser.add_argument("--live", action="store_true", help="Grab frame from live CCTV stream")
    parser.add_argument("--no_excel", action="store_true", help="Skip logging to Excel")
    args = parser.parse_args()

    import json
    with open(CFG_PATH, "r", encoding="utf-8") as f:
        cfg = json.load(f)

    if args.image:
        img_input = args.image
    elif args.night:
        img_input = os.path.join(BASE_DIR, "sample_images", "station1_muangkong_nighttime.jpg")
    else:
        img_input = DEFAULT_IMG

    if args.live:
        url = cfg.get("stream_url")
        print(f"Connecting to live stream: {url}...")
        cap = cv2.VideoCapture(url)
        ret, frame = cap.read()
        cap.release()
        if not ret:
            print("❌ Failed to grab live frame from CCTV stream")
            return
        img_src_name = "live_cctv_stream.jpg"
    else:
        if not os.path.exists(img_input):
            print(f"❌ Input image not found: {img_input}")
            return
        frame = cv2.imread(img_input)
        img_src_name = os.path.basename(img_input)

    pole_mgr = PoleCoordinateManager(cfg)
    rectified, enhanced, pts_src = pole_mgr.extract_and_rectify(frame)
    calibrator = PiecewiseScaleCalibrator(cfg.get("piecewise_anchors", []))
    detector = WaterSurfaceDetector(calibrator, cfg)

    water_info = detector.detect_waterline(enhanced)
    timestamp = WaterLevelExcelLogger.extract_timestamp_from_path(img_src_name)

    if not args.no_excel:
        excel_path = os.path.join(BASE_DIR, "water_levels.xlsx")
        logger = WaterLevelExcelLogger(excel_path)
        logger.log_water_level("Muangkong", water_info["water_level"], timestamp)

    dashboard = build_dashboard(frame, enhanced, water_info, pole_mgr, calibrator, cfg, img_src_name)
    
    # บันทึกทั้งชื่อมาตรฐานและชื่อ Benchmark
    os.makedirs(os.path.join(BASE_DIR, "output"), exist_ok=True)
    if args.output:
        out_path = args.output
        cv2.imwrite(out_path, dashboard)
    else:
        out_path = os.path.join(BASE_DIR, "output", "muangkong_result_dashboard.jpg")
        cv2.imwrite(out_path, dashboard)
        if args.night or "night" in img_src_name.lower():
            bench_out = os.path.join(BASE_DIR, "output", "result_muang_kong_nighttime_normal.jpg")
        else:
            bench_out = os.path.join(BASE_DIR, "output", "result_muang_kong_daytime_normal.jpg")
        cv2.imwrite(bench_out, dashboard)

    print("=" * 70)
    print(f"🌊 [Station 1] สะพานบ้านม่วงก็อง (X.173A)")
    print(f"📷 ภาพ: {img_src_name}")
    print(f"🕒 Timestamp: {timestamp}")
    print(f"📏 ระดับน้ำ: {water_info['water_level']:.2f} m R.T.K. [{water_info['status']}]")
    print(f"🎯 ความเชื่อมั่น: {water_info['confidence']*100:.1f}%")
    print(f"💾 Dashboard: {out_path}")
    print("=" * 70)


if __name__ == "__main__":
    main()
