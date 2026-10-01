"""
Tool: Calculate & Verify Pole Coordinates and Perspective Homography
เครื่องมือคำนวณและตรวจสอบพิกัดเสาวัดน้ำ (Staff Gauge Pole Coordinates) ทั้ง 3 สถานี
- คำนวณพิกัดมุม 4 จุด (Top-Left, Top-Right, Bottom-Right, Bottom-Left)
- คำนวณเมทริกซ์ 4-Point Homography (M) และ Inverse Perspective Transform (M^-1)
- คำนวณมุมเอียงของเสา (Tilt Angle), สัดส่วน Tapering, และความละเอียดพิกเซลต่อเมตร (px/m)
- บันทึกภาพวาดตรวจสอบพิกัดเสาและรอยต่อเมตรลงโฟลเดอร์ output/
"""

import os
import sys
import argparse
import json
import cv2
import numpy as np

# เพิ่ม root ของ non_time_series เข้า sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from core.pole_coordinates import PoleCoordinateManager
from core.scale_calibrator import PiecewiseScaleCalibrator

STATION_CONFIGS = {
    "1": os.path.join(BASE_DIR, "configs", "station1_muangkong.json"),
    "2": os.path.join(BASE_DIR, "configs", "station2_bangsala.json"),
    "3": os.path.join(BASE_DIR, "configs", "station3_hatyainai.json"),
    "muangkong": os.path.join(BASE_DIR, "configs", "station1_muangkong.json"),
    "bangsala": os.path.join(BASE_DIR, "configs", "station2_bangsala.json"),
    "hatyainai": os.path.join(BASE_DIR, "configs", "station3_hatyainai.json")
}

SAMPLE_IMAGES = {
    "1": os.path.join(BASE_DIR, "sample_images", "station1_muangkong.jpg"),
    "2": os.path.join(BASE_DIR, "sample_images", "station2_bangsala.png"),
    "3": os.path.join(BASE_DIR, "sample_images", "station3_hatyainai_daytime.jpg"),
    "muangkong": os.path.join(BASE_DIR, "sample_images", "station1_muangkong.jpg"),
    "bangsala": os.path.join(BASE_DIR, "sample_images", "station2_bangsala.png"),
    "hatyainai": os.path.join(BASE_DIR, "sample_images", "station3_hatyainai_daytime.jpg")
}


def analyze_station_pole(station_id, save_visual=True):
    cfg_file = STATION_CONFIGS[str(station_id).lower()]
    with open(cfg_file, "r", encoding="utf-8") as f:
        cfg = json.load(f)

    mgr = PoleCoordinateManager(cfg)
    geom = mgr.calculate_pole_geometry()

    print("=" * 80)
    print(f"📍 การวิเคราะห์พิกัดและเรขาคณิตของเสาวัดน้ำ: สถานี {cfg.get('thai_name')} ({cfg.get('station_code')})")
    print("=" * 80)
    print(f"🏷️  ชื่อระบุระบบ: {cfg.get('station_name')}")
    print(f"📷 กล้อง CCTV: {cfg.get('camera_name')} (ความละเอียดอ้างอิง: {cfg.get('reference_frame_resolution')[0]}x{cfg.get('reference_frame_resolution')[1]})")
    print(f"🗺️  สถานที่: {cfg.get('location')}")
    print("-" * 80)
    print("📐 พิกัดมุม 4 จุดของเสาวัดน้ำ (Staff Gauge Quad Vertices):")
    pts = geom["source_points"]
    print(f"   • มุมบนซ้าย (Top-Left):     X = {pts[0][0]:7.1f} px, Y = {pts[0][1]:7.1f} px")
    print(f"   • มุมบนขวา (Top-Right):    X = {pts[1][0]:7.1f} px, Y = {pts[1][1]:7.1f} px")
    print(f"   • มุมล่างขวา (Bottom-Right): X = {pts[2][0]:7.1f} px, Y = {pts[2][1]:7.1f} px")
    print(f"   • มุมล่างซ้าย (Bottom-Left):  X = {pts[3][0]:7.1f} px, Y = {pts[3][1]:7.1f} px")
    print("-" * 80)
    print("📊 คุณสมบัติทางเรขาคณิต (Geometric Parameters):")
    print(f"   • ความสูงของเสาบนภาพ (Average Height):     {geom['average_height_px']} px")
    print(f"   • ความกว้างหัวเสา / โคนเสา (Top / Bottom):   {geom['top_width_px']} px / {geom['bottom_width_px']} px")
    print(f"   • สัดส่วนสอบเข้าตามเปอร์สเปกทีฟ (Taper):     {geom['perspective_taper_ratio']}x")
    print(f"   • มุมเอียงของเสาจากแนวดิ่ง (Tilt Angle):    {geom['tilt_angle_degrees']} องศา")
    print(f"   • ความละเอียดภาพดิบเฉลี่ย (Raw px/m):        {geom['pixels_per_meter_raw']} px/m")
    print(f"   • ความละเอียดภาพขยาย Enhanced (Enh px/m):  {geom['pixels_per_meter_enhanced']} px/m")

    # คำนวณ Homography Matrix
    ref_shape = (cfg.get('reference_frame_resolution')[1], cfg.get('reference_frame_resolution')[0], 3)
    M, M_inv, _ = mgr.compute_homography_matrices(ref_shape)

    print("-" * 80)
    print("🔄 เมทริกซ์การแปลงมุมมอง Homography (M) [Frame -> Rectified Staff Gauge]:")
    for row in M:
        print(f"   [{row[0]:12.6e}, {row[1]:12.6e}, {row[2]:12.6e}]")

    print("\n🔄 เมทริกซ์การแปลงมุมมองย้อนกลับ Inverse Homography (M^-1) [Rectified -> Frame]:")
    for row in M_inv:
        print(f"   [{row[0]:12.6e}, {row[1]:12.6e}, {row[2]:12.6e}]")

    print("-" * 80)
    print("📏 จุดสอบเทียบระดับความสูงตามรอยต่อจริง (Piecewise Anchors):")
    calibrator = PiecewiseScaleCalibrator(cfg.get("piecewise_anchors", []))
    for lvl, y in calibrator.anchors:
        # คำนวณพิกัดย้อนกลับไปบนภาพกล้อง CCTV
        cctv_x, cctv_y = mgr.transform_gauge_to_cctv(mgr.enh_w / 2.0, y)
        print(f"   • ระดับ {lvl:5.2f} m R.T.K. -> Enhanced Y = {y:4d} px | กล้อง CCTV: (X={cctv_x:6.1f}, Y={cctv_y:6.1f})")

    # วาดภาพตรวจสอบความถูกต้องถ้ามีตัวอย่างภาพ
    sample_img_path = SAMPLE_IMAGES.get(str(station_id).lower())
    if save_visual and sample_img_path and os.path.exists(sample_img_path):
        frame = cv2.imread(sample_img_path)
        if frame is not None:
            vis = frame.copy()
            mgr.compute_homography_matrices(frame.shape)

            # วาดกรอบเสา 4 เหลี่ยม
            src_pts = mgr.last_pts_src.astype(np.int32)
            cv2.polylines(vis, [src_pts], isClosed=True, color=(0, 255, 255), thickness=3)

            # วาดจุดมาร์กเกอร์และเส้นเมตร
            for lvl, y in calibrator.anchors:
                # แปลงขอบซ้ายและขวาของเสาที่ระดับความสูงนี้
                fx_left, fy_left = mgr.transform_gauge_to_cctv(0, y)
                fx_right, fy_right = mgr.transform_gauge_to_cctv(mgr.enh_w, y)
                pt1 = (int(round(fx_left)), int(round(fy_left)))
                pt2 = (int(round(fx_right)), int(round(fy_right)))
                cv2.line(vis, pt1, pt2, (0, 0, 255), 2)
                cv2.putText(vis, f"{lvl:.1f}m", (pt2[0] + 8, pt2[1] + 4),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 255), 1, cv2.LINE_AA)

            out_dir = os.path.join(BASE_DIR, "output")
            os.makedirs(out_dir, exist_ok=True)
            out_vis_path = os.path.join(out_dir, f"pole_verification_{cfg.get('station_name')}.jpg")
            cv2.imwrite(out_vis_path, vis)
            print(f"💾 บันทึกภาพวาดตรวจสอบพิกัดเสาที่: {out_vis_path}")

    print("=" * 80 + "\n")
    return geom


def main():
    parser = argparse.ArgumentParser(description="Calculate Pole Coordinates & Perspective Matrices")
    parser.add_argument("--station", type=str, default="all",
                        choices=["all", "1", "2", "3", "muangkong", "bangsala", "hatyainai"],
                        help="Station to calculate (all, 1, 2, or 3)")
    args = parser.parse_args()

    if args.station == "all":
        for s in ["1", "2", "3"]:
            analyze_station_pole(s)
    else:
        analyze_station_pole(args.station)


if __name__ == "__main__":
    main()
