"""
Step 1: Crop, Perspective Rectification & Image Enhancement Tool
ตัดภาพเสาวัดน้ำ, ดัดมุมมองเอียง (Perspective Rectification), และปรับปรุงคุณภาพความคมชัด (Super-Resolution + CLAHE)
รองรับทั้ง 3 สถานี: Muangkong (X.173A), Bangsala (X.90), และ Hatyainai (X.44)
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

from core.pole_coordinates import PoleCoordinateManager

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


def main():
    parser = argparse.ArgumentParser(description="Step 1: Crop & Enhance Staff Gauge")
    parser.add_argument("--station", type=str, default="hatyainai", choices=["muangkong", "bangsala", "hatyainai"],
                        help="Station to process")
    parser.add_argument("--image", type=str, default=None, help="Input CCTV image path")
    parser.add_argument("--output_dir", type=str, default=os.path.join(BASE_DIR, "output"), help="Output directory")
    args = parser.parse_args()

    cfg_path = CONFIG_MAP[args.station]
    img_path = args.image if args.image else DEFAULT_IMAGES[args.station]

    if not os.path.exists(img_path):
        print(f"❌ Input image not found: {img_path}")
        return

    frame = cv2.imread(img_path)
    if frame is None:
        print(f"❌ Failed to decode image: {img_path}")
        return

    mgr = PoleCoordinateManager(cfg_path)
    rectified, enhanced, pts_src = mgr.extract_and_rectify(frame)

    os.makedirs(args.output_dir, exist_ok=True)
    out_rect = os.path.join(args.output_dir, f"{args.station}_step1_rectified.png")
    out_enh = os.path.join(args.output_dir, f"{args.station}_step1_enhanced.png")

    cv2.imwrite(out_rect, rectified)
    cv2.imwrite(out_enh, enhanced)

    print("=" * 70)
    print(f"✅ Step 1 เสร็จสมบูรณ์: สถานี {mgr.station_name} ({mgr.station_code})")
    print(f"📷 ภาพต้นฉบับ: {img_path} ({frame.shape[1]}x{frame.shape[0]})")
    print(f"📐 ตัดดัดภาพเสา Rectified: {rectified.shape[1]}x{rectified.shape[0]} px -> {out_rect}")
    print(f"✨ ขยายภาพ Super-Res Enhanced: {enhanced.shape[1]}x{enhanced.shape[0]} px -> {out_enh}")
    print("=" * 70)


if __name__ == "__main__":
    main()
