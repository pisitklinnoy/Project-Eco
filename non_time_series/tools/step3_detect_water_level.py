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
    "muangkong": os.path.join(BASE_DIR, "sample_images", "station1_muangkong_daytime.jpg"),
    "bangsala": os.path.join(BASE_DIR, "sample_images", "station2_bangsala_daytime.jpg"),
    "hatyainai": os.path.join(BASE_DIR, "sample_images", "station3_hatyainai_daytime.jpg")
}


def build_dashboard(frame, enhanced_gauge, water_info, pole_mgr, calibrator, cfg, image_path):
    """
    เรนเดอร์ภาพ Dashboard แบบ 100% ตามมาตรฐาน verify_daytime_normal.jpg
    - ซ้าย: เสา Enhanced พร้อมสเกลไม้บรรทัด Dark Theme (พื้นหลังดำ 26, 26, 26 ขีดระดับเมตรสีเหลืองทอง)
    - ขวา: ภาพ CCTV ความละเอียดเต็ม คมชัด ไม่แตก ตีกรอบเสาสีเขียว พร้อมเส้นระดับน้ำสีส้มบนผิวน้ำ
    - บน: Header Banner ดำเข้ม (24, 24, 24) ตัวหนังสือภาษาอังกฤษคมชัด ไม่เป็น ????
    """
    water_y = water_info["water_y"]
    water_level = water_info["water_level"]
    confidence = water_info["confidence"]

    station_code = cfg.get("station_code", "Unknown")
    bank_lvl = cfg.get("warning_thresholds", {}).get("critical_flood_m") if station_code == "X.90" else None
    gauge_overlay = calibrator.render_calibrated_overlay(
        enhanced_gauge,
        water_surface_y=water_y,
        water_surface_level=water_level,
        draw_boxes=(station_code == "X.173A"),
        bank_level=bank_lvl
    )
    gh, gw = gauge_overlay.shape[:2]

    # 2. ปรับขนาดภาพมุมกล้องรวม CCTV ให้ความสูงเท่ากับเสาพอดี
    fh, fw = frame.shape[:2]
    target_frame_h = gh
    target_frame_w = int(fw * (target_frame_h / float(fh)))
    frame_resized = cv2.resize(frame, (target_frame_w, target_frame_h), interpolation=cv2.INTER_AREA)

    scale_x = target_frame_w / float(fw)
    scale_y = target_frame_h / float(fh)
    station_code = cfg.get("station_code", "Unknown")

    # 3. วาดกรอบเสาสีเขียวและเส้นระดับน้ำสีส้มบนภาพ CCTV
    # 3. วาดกรอบเสาสีเขียวและเส้นระดับน้ำสีส้มบนภาพ CCTV
    if station_code == "X.44" and pole_mgr.has_polygon:
        # สไตล์สถานีสะพานหาดใหญ่นอก (X.44) ตามแบบฉบับ result_hatyai_nighttime_normal.jpg / result_hatayi_daytime_generate_flood.jpg
        pts_src = pole_mgr.last_pts_src.copy()
        fx1 = int(round(pts_src[:, 0].min() * scale_x))
        fy1 = int(round(pts_src[:, 1].min() * scale_y))
        fx2 = int(round(pts_src[:, 0].max() * scale_x))
        fy2 = int(round(pts_src[:, 1].max() * scale_y))
        cv2.rectangle(frame_resized, (fx1, fy1), (fx2, fy2), (0, 255, 0), 2)
        cv2.putText(frame_resized, "Staff Gauge", (fx1 - 10, max(30, fy1 - 10)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2, cv2.LINE_AA)

        # แปลงพิกัด water_y จาก Enhanced ROI เข้าสู่ระนาบมุมกล้อง CCTV
        rect_h = cfg.get("rectified_roi", {}).get("height", 1120)
        enh_h = cfg.get("enhanced_roi", {}).get("height", 2240)
        rect_w = cfg.get("rectified_roi", {}).get("width", 40)
        poly = cfg.get("staff_gauge_polygon", {})
        p_src = np.float32([poly["top_left"], poly["top_right"], poly["bottom_right"], poly["bottom_left"]])
        p_dst = np.float32([[0, 0], [rect_w, 0], [rect_w, rect_h], [0, rect_h]])
        M_inv = np.linalg.inv(cv2.getPerspectiveTransform(p_src, p_dst))
        y_rect = float(water_y) * (float(rect_h) / float(enh_h))
        pt_rect_center = np.array([[[float(rect_w) / 2.0, y_rect]]], dtype=np.float32)
        frame_pt = cv2.perspectiveTransform(pt_rect_center, M_inv)[0][0]
        water_x_frame = int(round(frame_pt[0] * scale_x))
        water_y_frame = int(round(frame_pt[1] * scale_y))

        line_x1 = max(0, water_x_frame - 160)
        line_x2 = min(target_frame_w, water_x_frame + 200)
        cv2.line(frame_resized, (line_x1, water_y_frame), (line_x2, water_y_frame), (0, 140, 255), 4, cv2.LINE_AA)
        cv2.putText(frame_resized, f"Water: {water_level:.2f} m", (line_x2 + 8, water_y_frame + 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 140, 255), 2, cv2.LINE_AA)
    elif station_code == "X.90":
        # สไตล์สถานีสะพานบางศาลา (X.90) ตามแบบฉบับ result_bangsala_daytime_normal.jpg / result_bangsala_nighttime.jpg
        pts = pole_mgr.last_pts_src
        fx1, fy1 = int(round(pts[0][0] * scale_x)), int(round(pts[0][1] * scale_y))
        fx2, fy2 = int(round(pts[2][0] * scale_x)), int(round(pts[2][1] * scale_y))
        cv2.rectangle(frame_resized, (fx1, fy1), (fx2, fy2), (0, 255, 0), 2)
        cv2.putText(frame_resized, "Staff Gauge X.90", (fx1 - 10, max(25, fy1 - 8)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2, cv2.LINE_AA)
        norm_y = water_y / float(gh)
        water_y_frame = int(round(fy1 + norm_y * (fy2 - fy1)))
        cv2.line(frame_resized, (max(0, fx1 - 50), water_y_frame),
                 (min(target_frame_w, fx2 + 70), water_y_frame), (0, 140, 255), 3, cv2.LINE_AA)
    else:
        # สไตล์สถานีบ้านม่วงก็อง (X.173A) ตามแบบฉบับ result_muang_kong_daytime_normal.jpg / result_muang_kong_nighttime_normal.jpg
        pts = pole_mgr.last_pts_src
        fx1, fy1 = int(round(pts[0][0] * scale_x)), int(round(pts[0][1] * scale_y))
        fx2, fy2 = int(round(pts[2][0] * scale_x)), int(round(pts[2][1] * scale_y))
        cv2.rectangle(frame_resized, (fx1, fy1), (fx2, fy2), (0, 255, 0), 2)
        cv2.putText(frame_resized, "Staff Gauge", (fx1 - 10, max(25, fy1 - 8)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2, cv2.LINE_AA)
        norm_y = water_y / float(gh)
        water_y_frame = int(round(fy1 + norm_y * (fy2 - fy1)))
        cv2.line(frame_resized, (max(0, fx1 - 50), water_y_frame),
                 (min(target_frame_w, fx2 + 70), water_y_frame), (0, 140, 255), 3, cv2.LINE_AA)

    # 4. แถบ Header Banner สีดำด้านบน
    banner_h = 100
    canvas = np.zeros((gh + banner_h, gw + target_frame_w, 3), dtype=np.uint8)
    canvas[:] = (24, 24, 24)

    canvas[banner_h:, :gw] = gauge_overlay
    canvas[banner_h:, gw:] = frame_resized

    # สีสถานะเตือนภัย
    thresholds = cfg.get("warning_thresholds", {"normal_m": 14.0, "warning_m": 16.0, "critical_flood_m": 16.4})
    crit_m = thresholds.get("critical_flood_m", 999.0)
    warn_m = thresholds.get("warning_m", 999.0)

    if water_level >= crit_m:
        status_color = (0, 0, 255)
        status_text = "CRITICAL FLOOD"
    elif water_level >= warn_m:
        status_color = (0, 215, 255)
        status_text = "WARNING LEVEL"
    else:
        status_color = (0, 255, 120)
        status_text = "NORMAL LEVEL"

    if station_code == "X.44":
        # Station 3: Hatyainai Benchmark Format
        cv2.putText(canvas, "AUTOMATED CCTV WATER LEVEL MONITORING SYSTEM (STATION X.44 HATYAINAI)",
                    (25, 40), cv2.FONT_HERSHEY_DUPLEX, 0.85, (220, 220, 220), 2, cv2.LINE_AA)
        cv2.putText(canvas, f"WATER LEVEL: {water_level:.2f} m R.T.K.  [{status_text}]",
                    (25, 82), cv2.FONT_HERSHEY_DUPLEX, 1.05, status_color, 2, cv2.LINE_AA)
        disp_y = int(round(water_y / 2.0))
        cv2.putText(canvas, f"Confidence: {confidence*100:.1f}% | Anchor Y: {disp_y} px",
                    (1100, 82), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (180, 180, 180), 2, cv2.LINE_AA)
    elif station_code == "X.90":
        # Station 2: Bangsala Benchmark Format
        cv2.putText(canvas, "AUTOMATED CCTV WATER LEVEL MONITORING SYSTEM (X.90)",
                    (25, 38), cv2.FONT_HERSHEY_DUPLEX, 0.70, (220, 220, 220), 2, cv2.LINE_AA)
        cv2.putText(canvas, f"Confidence: {confidence*100:.1f}% | Anchor Y: {water_y} px",
                    (canvas.shape[1] - 460, 38), cv2.FONT_HERSHEY_SIMPLEX, 0.60, (0, 215, 255), 1, cv2.LINE_AA)
        cv2.putText(canvas, f"WATER LEVEL: {water_level:.2f} m R.T.K.  [{status_text}]",
                    (25, 80), cv2.FONT_HERSHEY_DUPLEX, 0.85, status_color, 2, cv2.LINE_AA)
    else:
        # Station 1: Muangkong Benchmark Format
        cv2.putText(canvas, "AUTOMATED CCTV WATER LEVEL MONITORING SYSTEM (SCCRN MUANGKONG)",
                    (25, 38), cv2.FONT_HERSHEY_DUPLEX, 0.75, (220, 220, 220), 2, cv2.LINE_AA)
        cv2.putText(canvas, f"WATER LEVEL: {water_level:.2f} m R.T.K.  [{status_text}]",
                    (25, 78), cv2.FONT_HERSHEY_DUPLEX, 0.95, status_color, 2, cv2.LINE_AA)
        cv2.putText(canvas, f"Confidence: {confidence*100:.1f}% | Anchor Y: {water_y} px",
                    (gw + 30, 78), cv2.FONT_HERSHEY_SIMPLEX, 0.70, (180, 180, 180), 2, cv2.LINE_AA)

    return canvas


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
