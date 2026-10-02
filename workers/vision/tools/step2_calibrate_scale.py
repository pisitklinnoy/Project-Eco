"""
Step 2: Piecewise Scale Calibration & Digital Ruler Generation
สร้างไม้บรรทัดดิจิทัลและสเกลความสูง (m R.T.K.) สำหรับเสาวัดน้ำ
อ้างอิงจากตำแหน่งจริงของรอยต่อแผ่นเสา (เช่น รอยต่อระหว่างเลข 1 กับ 9) และระดับหมุดสำรวจจริง
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

from core.scale_calibrator import PiecewiseScaleCalibrator

CONFIG_MAP = {
    "muangkong": os.path.join(BASE_DIR, "configs", "station1_muangkong.json"),
    "bangsala": os.path.join(BASE_DIR, "configs", "station2_bangsala.json"),
    "hatyainai": os.path.join(BASE_DIR, "configs", "station3_hatyainai.json")
}


def main():
    parser = argparse.ArgumentParser(description="Step 2: Calibrate Scale & Generate Digital Ruler")
    parser.add_argument("--station", type=str, default="hatyainai", choices=["muangkong", "bangsala", "hatyainai"])
    parser.add_argument("--input_gauge", type=str, default=None, help="Path to enhanced gauge image")
    parser.add_argument("--output", type=str, default=None, help="Path to output image")
    args = parser.parse_args()

    cfg_path = CONFIG_MAP[args.station]
    with open(cfg_path, "r", encoding="utf-8") as f:
        cfg = json.load(f)

    enh_h = cfg.get("enhanced_roi", {}).get("height", 2240)
    enh_w = cfg.get("enhanced_roi", {}).get("width", 80)
    anchors = cfg.get("piecewise_anchors", [])

    calibrator = PiecewiseScaleCalibrator(anchors, base_height=enh_h)

    # โหลดภาพเสา ถ้าไม่มี ให้สร้างแผ่นว่างสีขาว
    gauge_path = args.input_gauge if args.input_gauge else os.path.join(BASE_DIR, "output", f"{args.station}_step1_enhanced.png")
    if os.path.exists(gauge_path):
        gauge = cv2.imread(gauge_path)
    else:
        gauge = np.full((enh_h, enh_w, 3), 230, dtype=np.uint8)

    h_g, w_g = gauge.shape[:2]
    warn_m = cfg.get("warning_thresholds", {}).get("warning_m")
    crit_m = cfg.get("warning_thresholds", {}).get("critical_flood_m")

    # สร้างแถบไม้บรรทัด
    ruler = calibrator.render_digital_ruler(height=h_g, width=140, warning_lvl=warn_m, critical_lvl=crit_m)

    # วาดเส้นเชื่อมต่อจากรอยต่อบนเสาไปยังไม้บรรทัด
    combined = np.hstack([gauge, ruler])

    # ขีดเส้นแดงที่ Anchor แต่ละจุด
    for lvl, y in calibrator.anchors:
        if 0 <= y < h_g:
            cv2.line(combined, (w_g - 15, y), (w_g + 15, y), (0, 0, 255), 2)
            cv2.circle(combined, (w_g, y), 3, (0, 0, 255), -1)

    out_path = args.output if args.output else os.path.join(BASE_DIR, "output", f"{args.station}_step2_calibrated_scale.jpg")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    cv2.imwrite(out_path, combined)

    print("=" * 70)
    print(f"✅ Step 2 สเกลเสาวัดน้ำ Calibrate เสร็จสมบูรณ์: สถานี {cfg.get('station_name')} ({cfg.get('station_code')})")
    print(f"📏 จำนวนจุดอ้างอิง Anchors: {len(anchors)} จุด (ช่วงระดับ {anchors[-1][0]:.2f}m ถึง {anchors[0][0]:.2f}m R.T.K.)")
    print(f"💾 บันทึกภาพสเกลไม้บรรทัดดิจิทัลที่: {out_path}")
    print("=" * 70)


if __name__ == "__main__":
    main()
