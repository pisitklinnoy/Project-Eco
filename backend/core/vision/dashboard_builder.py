"""
Standard CCTV Water Level Monitoring Dashboard Builder
สร้างภาพแดชบอร์ดตามมาตรฐานการตรวจสอบระดับน้ำ (Dark Theme + Golden Ticks + High-Resolution CCTV)
รองรับทั้งโหมด Polygon (YOLOv8-Seg) และโหมด กรอบ ROI (Bounding Box)
"""

import cv2
import numpy as np


def build_dashboard(
    frame,
    enhanced_gauge,
    water_info,
    pole_mgr,
    calibrator,
    cfg,
    image_path=None,
    yolo_info=None,
    overlay_mode="polygon"
):
    """
    เรนเดอร์ภาพ Dashboard แบบ 100% ตามมาตรฐาน
    - ซ้าย: เสา Enhanced พร้อมสเกลไม้บรรทัด Dark Theme (พื้นหลังดำ 26, 26, 26 ขีดระดับเมตรสีเหลืองทอง)
    - ขวา: ภาพ CCTV ความละเอียดเต็ม คมชัด ไม่แตก
      - overlay_mode == "polygon": วาด Polygon สีเขียวล้อมรอบเสาจาก YOLOv8-Seg พร้อม Badge
      - overlay_mode == "roi": วาดกรอบสี่เหลี่ยมสีเขียว (ROI Box) พร้อม Badge
      - เส้นระดับน้ำสีส้มบนผิวน้ำที่จุดตัดจริง
    - บน: Header Banner ดำเข้ม (24, 24, 24) ตัวหนังสือคมชัด
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

    # 3. วาดการตรวจจับบนภาพ CCTV: โหมด Polygon vs โหมด กรอบ ROI
    has_yolo = (yolo_info is not None and yolo_info.get("confidence") is not None and ("YOLO" in str(yolo_info.get("method", "")) or "HYBRID" in str(yolo_info.get("method", ""))))
    yolo_conf = yolo_info.get("confidence", 0.85) if has_yolo else 0.85
    gauge_poly = yolo_info.get("gauge_polygon") if yolo_info else None
    is_submerged = yolo_info.get("is_submerged_occluded", False) if yolo_info else False
    is_manual = yolo_info.get("is_manual", False) if yolo_info else False
    is_shifted = yolo_info.get("is_camera_shifted", False) if yolo_info else False
    conf_display = f"{yolo_conf*100:.1f}%" if has_yolo else "85.0%"

    # คำนวณพิกัดเสาใน frame_resized จาก source points ล่าสุดที่ผ่าน Hybrid Alignment
    pts_src = pole_mgr.last_pts_src
    if pts_src is not None:
        fx1 = int(round(pts_src[:, 0].min() * scale_x))
        fy1 = int(round(pts_src[:, 1].min() * scale_y))
        fx2 = int(round(pts_src[:, 0].max() * scale_x))
        fy2 = int(round(pts_src[:, 1].max() * scale_y))
    else:
        bb = cfg.get("staff_gauge_bbox", {"x1": 100, "y1": 100, "x2": 200, "y2": 500})
        fx1 = int(round(bb["x1"] * scale_x))
        fy1 = int(round(bb["y1"] * scale_y))
        fx2 = int(round(bb["x2"] * scale_x))
        fy2 = int(round(bb["y2"] * scale_y))

    # คำนวณ water_x_frame, water_y_frame ผ่าน Inverse Homography Transform ของ pole_mgr โดยตรง
    try:
        cctv_x, cctv_y = pole_mgr.transform_gauge_to_cctv(pole_mgr.enh_w / 2.0, water_y)
        water_x_frame = int(round(cctv_x * scale_x))
        water_y_frame = int(round(cctv_y * scale_y))
    except Exception:
        norm_y = water_y / float(gh)
        water_y_frame = int(round(fy1 + norm_y * (fy2 - fy1)))
        water_x_frame = int(round((fx1 + fx2) / 2.0))

    if is_manual:
        label_text = f"Manual BBox: Staff Gauge {station_code}"
    elif is_submerged:
        label_text = f"Hybrid: Extrapolated {station_code} ({conf_display})"
    elif is_shifted:
        label_text = f"Hybrid: Shift Aligned {station_code} ({conf_display})"
    elif has_yolo:
        label_text = f"Hybrid Aligned: Staff Gauge {station_code} ({conf_display})"
    else:
        label_text = f"ROI: Staff Gauge {station_code}"

    if overlay_mode == "polygon":
        # 3.1 โหมด Polygon (YOLOv8-Seg / 4-Point Homography Source)
        if gauge_poly is not None and len(gauge_poly) >= 3:
            g_scaled = (gauge_poly * np.array([scale_x, scale_y])).astype(np.int32)
        elif pts_src is not None and len(pts_src) == 4:
            g_scaled = (pts_src * np.array([scale_x, scale_y])).astype(np.int32).reshape(-1, 1, 2)
        else:
            # กรณีสภาพแสงมืดหรือกล้องอินฟราเรด สร้าง Polygon เสาส่วนที่โผล่เหนือน้ำถึงผิวน้ำจริง
            g_scaled = np.array([
                [[fx1, fy1]],
                [[fx2, fy1]],
                [[fx2, water_y_frame]],
                [[fx1, water_y_frame]]
            ], dtype=np.int32)

        overlay_g = frame_resized.copy()
        cv2.fillPoly(overlay_g, [g_scaled], (0, 255, 0))
        cv2.addWeighted(overlay_g, 0.25, frame_resized, 0.75, 0, frame_resized)
        cv2.polylines(frame_resized, [g_scaled], True, (0, 255, 0), 2, cv2.LINE_AA)

        min_gpt = g_scaled.reshape(-1, 2).min(axis=0)
        (tw, th), base = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)
        g_bx = max(10, int(min_gpt[0]))
        g_by = max(th + 14, int(min_gpt[1]))
        cv2.rectangle(frame_resized, (g_bx - 1, g_by - th - base - 8), (g_bx + tw + 14, g_by), (0, 200, 0), -1)
        cv2.putText(frame_resized, label_text, (g_bx + 6, g_by - base - 3),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 1, cv2.LINE_AA)

    else:
        # 3.2 โหมด กรอบ ROI (Rectangular Bounding Box)
        cv2.rectangle(frame_resized, (fx1, fy1), (fx2, fy2), (0, 255, 0), 2)
        (tw, th), base = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)
        badge_y1 = max(0, fy1 - th - base - 10)
        cv2.rectangle(frame_resized, (fx1 - 1, badge_y1), (fx1 + tw + 14, fy1), (0, 200, 0), -1)
        cv2.putText(frame_resized, label_text, (fx1 + 6, fy1 - base - 4),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 1, cv2.LINE_AA)

    # 3.3 วาดเส้นระดับน้ำสีส้มบนแม่น้ำ
    line_x1 = max(0, water_x_frame - 160)
    line_x2 = min(target_frame_w, water_x_frame + 200)
    cv2.line(frame_resized, (line_x1, water_y_frame), (line_x2, water_y_frame), (0, 140, 255), 4, cv2.LINE_AA)
    cv2.putText(frame_resized, f"Water: {water_level:.2f} m", (min(target_frame_w - 200, line_x2 + 8), water_y_frame + 5),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 140, 255), 2, cv2.LINE_AA)

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

    ai_tag = " | YOLOv8-Seg AI" if overlay_mode == "polygon" else " | ROI Analysis"

    if station_code == "X.44":
        # Station 3: Hatyainai Benchmark Format
        cv2.putText(canvas, f"AUTOMATED CCTV WATER LEVEL MONITORING SYSTEM (STATION X.44 HATYAINAI){ai_tag}",
                    (25, 40), cv2.FONT_HERSHEY_DUPLEX, 0.80, (220, 220, 220), 2, cv2.LINE_AA)
        cv2.putText(canvas, f"WATER LEVEL: {water_level:.2f} m R.T.K.  [{status_text}]",
                    (25, 82), cv2.FONT_HERSHEY_DUPLEX, 1.05, status_color, 2, cv2.LINE_AA)
        disp_y = int(round(water_y / 2.0))
        cv2.putText(canvas, f"Confidence: {confidence*100:.1f}% | Anchor Y: {disp_y} px",
                    (min(canvas.shape[1] - 450, 1100), 82), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (180, 180, 180), 2, cv2.LINE_AA)
    elif station_code == "X.90":
        # Station 2: Bangsala Benchmark Format
        cv2.putText(canvas, f"AUTOMATED CCTV WATER LEVEL MONITORING SYSTEM (X.90){ai_tag}",
                    (25, 38), cv2.FONT_HERSHEY_DUPLEX, 0.70, (220, 220, 220), 2, cv2.LINE_AA)
        cv2.putText(canvas, f"Confidence: {confidence*100:.1f}% | Anchor Y: {water_y} px",
                    (max(25, canvas.shape[1] - 460), 38), cv2.FONT_HERSHEY_SIMPLEX, 0.60, (0, 215, 255), 1, cv2.LINE_AA)
        cv2.putText(canvas, f"WATER LEVEL: {water_level:.2f} m R.T.K.  [{status_text}]",
                    (25, 80), cv2.FONT_HERSHEY_DUPLEX, 0.85, status_color, 2, cv2.LINE_AA)
    else:
        # Station 1: Muangkong Benchmark Format
        cv2.putText(canvas, f"AUTOMATED CCTV WATER LEVEL MONITORING SYSTEM (SCCRN MUANGKONG){ai_tag}",
                    (25, 38), cv2.FONT_HERSHEY_DUPLEX, 0.75, (220, 220, 220), 2, cv2.LINE_AA)
        cv2.putText(canvas, f"WATER LEVEL: {water_level:.2f} m R.T.K.  [{status_text}]",
                    (25, 78), cv2.FONT_HERSHEY_DUPLEX, 0.95, status_color, 2, cv2.LINE_AA)
        cv2.putText(canvas, f"Confidence: {confidence*100:.1f}% | Anchor Y: {water_y} px",
                    (gw + 30, 78), cv2.FONT_HERSHEY_SIMPLEX, 0.70, (180, 180, 180), 2, cv2.LINE_AA)

    return canvas

def render_gauge_overlay(enhanced_gauge, water_info, calibrator, cfg):
    """
    เรนเดอร์เฉพาะภาพสเกลเสา Enhanced พร้อมไม้บรรทัดดิจิทัลและขีดระดับน้ำ (Dark Theme + Golden Ticks)
    เหมาะสำหรับแสดงผลแบบเดี่ยวในโหมด 'สเกลเสาวัดน้ำ'
    """
    water_y = water_info["water_y"]
    water_level = water_info["water_level"]
    station_code = cfg.get("station_code", "Unknown")
    bank_lvl = cfg.get("warning_thresholds", {}).get("critical_flood_m") if station_code == "X.90" else None

    gauge_overlay = calibrator.render_calibrated_overlay(
        enhanced_gauge,
        water_surface_y=water_y,
        water_surface_level=water_level,
        draw_boxes=(station_code == "X.173A"),
        bank_level=bank_lvl
    )
    return gauge_overlay


def render_cctv_frame(frame, water_info, pole_mgr, calibrator, cfg, yolo_info=None, overlay_mode="bbox"):
    """
    เรนเดอร์เฉพาะภาพกล้อง CCTV แบบ 16:9 คมชัดเต็มตา พร้อมกรอบ Bounding Box ของเสาวัดน้ำ และเส้นระดับน้ำสีส้ม
    เหมาะสำหรับแสดงผลแบบเดี่ยวในโหมด 'กล้อง CCTV'
    """
    out = frame.copy()
    fh, fw = out.shape[:2]
    station_code = cfg.get("station_code", "Unknown")
    water_level = water_info["water_level"]
    water_y = water_info["water_y"]

    # 1. พิกัดเสา
    if pole_mgr.last_pts_src is not None:
        pts_src = pole_mgr.last_pts_src
        fx1 = int(round(pts_src[:, 0].min()))
        fy1 = int(round(pts_src[:, 1].min()))
        fx2 = int(round(pts_src[:, 0].max()))
        fy2 = int(round(pts_src[:, 1].max()))
    elif yolo_info and "aligned_bbox" in yolo_info and yolo_info["aligned_bbox"]:
        fx1, fy1, fx2, fy2 = yolo_info["aligned_bbox"]
    elif yolo_info and "bbox" in yolo_info and yolo_info["bbox"]:
        fx1, fy1, fx2, fy2 = yolo_info["bbox"]
    else:
        bb = cfg.get("staff_gauge_bbox", {"x1": 100, "y1": 100, "x2": 200, "y2": 500})
        fx1, fy1, fx2, fy2 = bb["x1"], bb["y1"], bb["x2"], bb["y2"]

    has_yolo = (yolo_info is not None and yolo_info.get("confidence") is not None and ("YOLO" in str(yolo_info.get("method", "")) or "HYBRID" in str(yolo_info.get("method", ""))))
    yolo_conf = yolo_info.get("confidence", 0.90) if has_yolo else 0.90
    conf_display = f"{yolo_conf*100:.1f}%" if has_yolo else "92.0%"
    is_submerged = yolo_info.get("is_submerged_occluded", False) if yolo_info else False
    is_manual = yolo_info.get("is_manual", False) if yolo_info else False
    is_shifted = yolo_info.get("is_camera_shifted", False) if yolo_info else False

    # 2. วาดกรอบ Bounding Box (สีเขียว หนา 3-4 px ชัดเจน ไม่รกตา)
    if overlay_mode == "none":
        return out

    if is_manual:
        badge_title = "Manual BBox: Staff Gauge"
    elif is_submerged:
        badge_title = f"Hybrid: Extrapolated ({conf_display})"
    elif is_shifted:
        badge_title = f"Hybrid: Shift Aligned ({conf_display})"
    elif has_yolo:
        badge_title = f"Hybrid Aligned: Staff Gauge ({conf_display})"
    else:
        badge_title = f"ROI: Staff Gauge"

    if overlay_mode == "polygon" and pole_mgr.last_pts_src is not None and len(pole_mgr.last_pts_src) == 4:
        g_poly = pole_mgr.last_pts_src.astype(np.int32)
        overlay_g = out.copy()
        cv2.fillPoly(overlay_g, [g_poly], (0, 255, 0))
        cv2.addWeighted(overlay_g, 0.25, out, 0.75, 0, out)
        cv2.polylines(out, [g_poly], True, (0, 255, 0), 3, cv2.LINE_AA)
    else:
        cv2.rectangle(out, (fx1, fy1), (fx2, fy2), (0, 255, 0), 3)

    # Badge เหนือเสา
    (tw, th), base = cv2.getTextSize(badge_title, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)
    badge_y1 = max(0, fy1 - th - base - 12)
    cv2.rectangle(out, (fx1 - 2, badge_y1), (fx1 + tw + 18, fy1), (0, 200, 0), -1)
    cv2.putText(out, badge_title, (fx1 + 8, fy1 - base - 4),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 2, cv2.LINE_AA)

    # 3. วาดเส้นระดับน้ำสีส้มบนแม่น้ำ
    try:
        cctv_x, cctv_y = pole_mgr.transform_gauge_to_cctv(pole_mgr.enh_w / 2.0, water_y)
        water_x_frame = int(round(cctv_x))
        water_y_frame = int(round(cctv_y))
    except Exception:
        enh_h = cfg.get("enhanced_roi", {}).get("height", 2000)
        norm_y = water_y / float(enh_h)
        water_y_frame = int(round(fy1 + norm_y * (fy2 - fy1)))
        water_x_frame = int(round((fx1 + fx2) / 2.0))

    cv2.line(out, (max(0, water_x_frame - 140), water_y_frame), (min(fw, water_x_frame + 180), water_y_frame), (0, 140, 255), 4, cv2.LINE_AA)
    water_str = f"Water: {water_level:.2f} m"
    cv2.putText(out, water_str, (min(fw - 260, water_x_frame + 190), water_y_frame + 8),
                cv2.FONT_HERSHEY_SIMPLEX, 0.85, (0, 140, 255), 2, cv2.LINE_AA)

    # 4. ป้ายกำกับล่างซ้าย
    status_text = f"ระดับน้ำตรวจวัด AI: {water_level:.2f} ม. รทก."
    cv2.putText(out, status_text, (30, fh - 40), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 120), 2, cv2.LINE_AA)

    return out


def render_model_v2_detection_view(
    frame: np.ndarray,
    station_name: str,
    raw_detections: list,
    model_name: str = "model_best_v2.pt",
    overlay_mode: str = "bbox",
    hybrid_info: dict = None
) -> np.ndarray:
    """
    เรนเดอร์ผลการตรวจจับเสาวัดน้ำแบบ Hybrid Aligned ระหว่างโมเดล YOLO และพิกัดโครงสร้าง Config
    - ยึดหัวเสา (Top-Cap Anchor) และชดเชยการเลื่อนของกล้อง (Camera Shift)
    - Anti-Occlusion Extrapolation: ดึงสเกลเต็มเสาลงสู่ใต้น้ำเมื่อเกิดน้ำท่วมบังเสาท่อนล่าง
    - คัดกรองและติดป้าย AI Noise สำรวจจุดตรวจจับนอก Corridor ของเสา
    """
    out = frame.copy()

    # กรณีมี hybrid_info ส่งเข้ามา
    if hybrid_info:
        method = hybrid_info.get("method", "")
        is_manual = hybrid_info.get("is_manual", False)
        is_submerged = hybrid_info.get("is_submerged_occluded", False)
        is_shifted = hybrid_info.get("is_camera_shifted", False)
        is_night = hybrid_info.get("is_night_anchor", False) or method == "NIGHT_FIXED_ANCHOR"
        conf = hybrid_info.get("confidence", 0.90)
        shift = hybrid_info.get("camera_shift", {})
        dx = shift.get("dx", 0.0)
        ax1, ay1, ax2, ay2 = hybrid_info["aligned_bbox"]
        raw_box = hybrid_info.get("raw_yolo_bbox")

        # แสดงเฉพาะกรอบ Bounding Box ที่ตรวจจับได้จากโมเดล YOLO โดยตรง (หรือ Aligned Box) เพียงกรอบเดียว
        if raw_box and len(raw_box) == 4 and not is_manual:
            bx1, by1, bx2, by2 = raw_box
            # ครอบคลุมลงมาถึงฐานเสาและผิวน้ำตาม aligned_bbox เสมอ
            by2 = max(by2, ay2)
        else:
            bx1, by1, bx2, by2 = ax1, ay1, ax2, ay2

        if is_manual:
            box_color = (0, 165, 255)  # Amber
            badge_txt = "Staff Gauge: Manual"
            badge_bg = (0, 120, 220)
        elif is_night:
            box_color = (0, 230, 255)  # Cyan Gold
            badge_txt = f"Staff Gauge (Night Vision): {conf*100:.1f}%" if conf < 1.0 else "Staff Gauge (Night Anchor)"
            badge_bg = (0, 130, 180)
        elif raw_box:
            box_color = (0, 255, 100)  # Bright Emerald
            badge_txt = f"Staff Gauge: {conf*100:.1f}%"
            badge_bg = (0, 150, 50)
        else:
            box_color = (0, 210, 255)
            badge_txt = f"Staff Gauge: Anchor ({conf*100:.1f}%)"
            badge_bg = (0, 120, 180)

        # วาดกรอบเสาหลักเพียงกรอบเดียว ไม่แสดง Filtered Box อื่นๆ
        cv2.rectangle(out, (bx1, by1), (bx2, by2), box_color, 3)

        # Corner brackets เพิ่มความคมชัด
        c_len = min(22, max(8, (bx2 - bx1) // 3))
        cv2.line(out, (bx1, by1), (bx1 + c_len, by1), (255, 255, 255), 4)
        cv2.line(out, (bx1, by1), (bx1, by1 + c_len), (255, 255, 255), 4)
        cv2.line(out, (bx2, by2), (bx2 - c_len, by2), (255, 255, 255), 4)
        cv2.line(out, (bx2, by2), (bx2, by2 - c_len), (255, 255, 255), 4)

        # Badge เหนือหัวเสา
        (tw, th), base = cv2.getTextSize(badge_txt, cv2.FONT_HERSHEY_SIMPLEX, 0.65, 2)
        by_top = max(0, by1 - th - 12)
        cv2.rectangle(out, (bx1 - 2, by_top), (bx1 + tw + 16, by1), badge_bg, -1)
        cv2.putText(out, badge_txt, (bx1 + 6, by1 - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2, cv2.LINE_AA)

        return out

    # Fallback กรณีไม่มี hybrid_info
    gauges = [d for d in raw_detections if d.get("name") == "Staff Gauge"]
    if gauges:
        best_g = max(gauges, key=lambda d: d.get("confidence", 0.0))
        bx1, by1, bx2, by2 = best_g["bbox"]
        conf = best_g.get("confidence", 0.0)
        is_manual = best_g.get("is_manual", False)

        box_color = (0, 165, 255) if is_manual else (0, 255, 100)
        cv2.rectangle(out, (bx1, by1), (bx2, by2), box_color, 3)

        c_len = min(20, max(6, (bx2 - bx1) // 3))
        cv2.line(out, (bx1, by1), (bx1 + c_len, by1), (255, 255, 255), 4)
        cv2.line(out, (bx1, by1), (bx1, by1 + c_len), (255, 255, 255), 4)
        cv2.line(out, (bx2, by2), (bx2 - c_len, by2), (255, 255, 255), 4)
        cv2.line(out, (bx2, by2), (bx2, by2 - c_len), (255, 255, 255), 4)

        badge_txt = "Staff Gauge: Manual" if is_manual else f"Staff Gauge: {conf*100:.1f}%"
        badge_bg = (0, 120, 220) if is_manual else (0, 150, 50)
        (tw, th), base = cv2.getTextSize(badge_txt, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)
        by_top = max(0, by1 - th - 12)
        cv2.rectangle(out, (bx1 - 2, by_top), (bx1 + tw + 16, by1), badge_bg, -1)
        cv2.putText(out, badge_txt, (bx1 + 6, by1 - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)

    return out


def render_gauge_not_detected_image(
    frame_shape: tuple,
    station_name: str,
    model_name: str = "model_best_v2.pt"
) -> np.ndarray:
    """
    สร้างภาพแจ้งเตือนเมื่อ AI ตรวจไม่พบเสาวัดระดับน้ำ สำหรับโหมด Gauge Ruler หรือ Composite
    แจ้งเตือนผู้ใช้ให้ใช้ฟีเจอร์ วาดกรอบเสาด้วยมือ (Manual BBox) เพื่อนำไป Retrain Model
    """
    h = max(720, frame_shape[0])
    w = max(1280, frame_shape[1])
    canvas = np.zeros((h, w, 3), dtype=np.uint8)
    canvas[:] = (42, 23, 15)  # Dark slate navy in BGR

    # กรอบกล่องข้อความเตือนตรงกลาง
    box_w = min(w - 80, 980)
    box_h = min(h - 80, 500)
    bx1 = (w - box_w) // 2
    by1 = (h - box_h) // 2
    bx2 = bx1 + box_w
    by2 = by1 + box_h

    # Card background
    cv2.rectangle(canvas, (bx1, by1), (bx2, by2), (56, 32, 24), -1)
    cv2.rectangle(canvas, (bx1, by1), (bx2, by2), (40, 160, 245), 2)  # Amber border

    # Warning Header
    cv2.putText(canvas, "[!] STAFF GAUGE NOT DETECTED", (bx1 + 50, by1 + 75),
                cv2.FONT_HERSHEY_DUPLEX, 1.1, (50, 160, 255), 2, cv2.LINE_AA)
    cv2.putText(canvas, f"Station: {station_name} | AI Model: {model_name}", (bx1 + 50, by1 + 120),
                cv2.FONT_HERSHEY_SIMPLEX, 0.75, (200, 220, 245), 2, cv2.LINE_AA)

    # Separator
    cv2.line(canvas, (bx1 + 50, by1 + 145), (bx2 - 50, by1 + 145), (110, 80, 60), 1)

    # Explanation text
    cv2.putText(canvas, "Cannot extract staff gauge scale ruler or composite view",
                (bx1 + 50, by1 + 195), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (230, 235, 245), 2, cv2.LINE_AA)
    cv2.putText(canvas, "because no staff gauge was detected by the AI model in this frame.",
                (bx1 + 50, by1 + 235), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (170, 185, 205), 1, cv2.LINE_AA)

    # Recommendation Box
    rec_y1 = by1 + 275
    rec_y2 = by1 + 420
    cv2.rectangle(canvas, (bx1 + 50, rec_y1), (bx2 - 50, rec_y2), (75, 45, 32), -1)
    cv2.rectangle(canvas, (bx1 + 50, rec_y1), (bx2 - 50, rec_y2), (255, 160, 70), 1)

    cv2.putText(canvas, "RECOMMENDED ACTION:", (bx1 + 75, rec_y1 + 45),
                cv2.FONT_HERSHEY_SIMPLEX, 0.75, (50, 210, 255), 2, cv2.LINE_AA)
    cv2.putText(canvas, "Please use 'Manual Staff Gauge BBox' to draw the gauge box manually,",
                (bx1 + 75, rec_y1 + 85), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (240, 245, 255), 1, cv2.LINE_AA)
    cv2.putText(canvas, "save it to the retraining dataset, and immediately unblock gauge analysis.",
                (bx1 + 75, rec_y1 + 120), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (240, 245, 255), 1, cv2.LINE_AA)

    return canvas
