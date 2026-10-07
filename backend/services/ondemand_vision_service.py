import os
import cv2
import json
import uuid
import base64
import numpy as np
from datetime import datetime
from typing import Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import text
from services.minio_service import minio_service
from schemas.vision_ondemand import BoundingBox, CalibrationPoint, OnDemandPredictResponse

class OnDemandVisionService:
    @classmethod
    def process_and_predict(
        cls,
        image_bytes: bytes,
        bbox: BoundingBox,
        pt_high: CalibrationPoint,
        pt_low: CalibrationPoint,
        db: Session,
        station_code: Optional[str] = None,
        station_note: Optional[str] = "On-Demand Field Inspection",
        pt_water: Optional[CalibrationPoint] = None
    ) -> OnDemandPredictResponse:
        # 1. Decode รูปภาพจาก Bytes
        nparr = np.frombuffer(image_bytes, np.uint8)
        img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img_bgr is None:
            raise ValueError("Could not decode the uploaded image. Please check the image format.")

        orig_h, orig_w = img_bgr.shape[:2]

        # 2. ปรับและตัด Crop เฉพาะตัวเสาวัดน้ำตาม Bounding Box (ROI)
        bx = int(max(0, min(bbox.x, orig_w - 1)))
        by = int(max(0, min(bbox.y, orig_h - 1)))
        bw = int(max(5, min(bbox.width, orig_w - bx)))
        bh = int(max(10, min(bbox.height, orig_h - by)))

        cropped_gauge = img_bgr[by:by+bh, bx:bx+bw]

        # คำนวณสเกล 2-Point Linear Interpolation (Pixel-to-Meter)
        y_high = min(pt_high.y, pt_low.y)
        m_high = max(pt_high.actual_meter, pt_low.actual_meter)
        y_low = max(pt_high.y, pt_low.y)
        m_low = min(pt_high.actual_meter, pt_low.actual_meter)

        dy_pixel = max(1.0, float(y_low - y_high))
        dm_meter = float(m_high - m_low)
        scale_m_per_px = dm_meter / dy_pixel

        confidence_score = 0.91

        # 3. กำหนดตำแหน่งผิวน้ำ (Manual Pinpoint vs Auto 1D Change Point Analysis)
        if pt_water is not None:
            # กรณีผู้ใช้ระบุตำแหน่งผิวน้ำด้วยตนเอง (Manual Water Surface)
            y_water_orig = int(round(pt_water.y))
            best_y_crop = int(max(0, min(bh - 1, round(pt_water.y - by))))
            confidence_score = 1.0  # มั่นใจ 100% เพราะผู้ใช้ตรวจสอบและกำหนดจุดผิวน้ำเอง

            # หากมีการระบุ actual_meter มาด้วยและ > 0 ให้ใช้ค่านั้น หรือคำนวณจากพิกัด Y
            if pt_water.actual_meter is not None and pt_water.actual_meter > 0:
                calculated_level_m = round(float(pt_water.actual_meter), 3)
            else:
                calculated_level_m = max(0.0, round(float(m_high - ((y_water_orig - y_high) * scale_m_per_px)), 3))
        else:
            # กรณีค้นหาผิวน้ำอัตโนมัติด้วย 1D Change Point Analysis
            gray = cv2.cvtColor(cropped_gauge, cv2.COLOR_BGR2GRAY)
            cx1 = int(bw * 0.20)
            cx2 = int(bw * 0.80)
            stds = np.array([np.std(gray[y, cx1:cx2]) if cx2 > cx1 else np.std(gray[y, :]) for y in range(bh)], dtype=np.float32)

            win = max(5, int(bh * 0.05))
            rolling_max = np.array([
                np.max(stds[max(0, y - win // 2):min(bh, y + win // 2)])
                for y in range(bh)
            ])
            cum = np.cumsum(rolling_max)
            total_sum = float(cum[-1]) if len(cum) > 0 else 1.0

            scan_top = max(1, int(bh * 0.08))
            scan_bottom = min(bh - 1, int(bh * 0.92))

            best_y_crop = int(bh * 0.5)
            best_score = -1e9

            for y in range(scan_top, scan_bottom):
                m_above = cum[y - 1] / float(y)
                m_below = (total_sum - cum[y - 1]) / float(bh - y)
                score = m_above - m_below
                if score > best_score:
                    best_score = score
                    best_y_crop = y

            y_water_orig = by + best_y_crop
            calculated_level_m = max(0.0, round(float(m_high - ((y_water_orig - y_high) * scale_m_per_px)), 3))

        # 4. สร้างภาพพรีวิวผลลัพธ์ (Preview with Waterline)
        preview_img = cropped_gauge.copy()
        # ขีดเส้นระดับผิวน้ำ (สีส้มสดสำหรับผิวน้ำที่ระบุ/ตรวจพบ)
        line_color = (0, 140, 255) if pt_water is not None else (0, 0, 255)
        cv2.line(preview_img, (0, best_y_crop), (bw, best_y_crop), line_color, 3)
        # แถบแสดงตัวเลขผลลัพธ์
        cv2.rectangle(preview_img, (0, max(0, best_y_crop - 28)), (bw, best_y_crop), (0, 0, 0), -1)
        tag = "MANUAL" if pt_water is not None else "AI"
        cv2.putText(
            preview_img, 
            f"WL ({tag}): {calculated_level_m:.2f} m", 
            (5, max(18, best_y_crop - 8)),
            cv2.FONT_HERSHEY_SIMPLEX, 
            0.50, 
            (0, 220, 255) if pt_water is not None else (0, 255, 128), 
            2
        )

        _, buf = cv2.imencode(".jpg", preview_img)
        preview_b64 = f"data:image/jpeg;base64,{base64.b64encode(buf).decode('utf-8')}"

        # 5. บันทึกภาพลง MinIO และส่งเข้า Label Studio Database (Active Learning Loop)
        task_id, minio_path = cls._save_to_minio_and_label_studio(
            image_bytes=image_bytes,
            orig_w=orig_w,
            orig_h=orig_h,
            bbox=bbox,
            y_water_orig=y_water_orig,
            db=db,
            station_note=station_note or "On-Demand Field Inspection"
        )

        # 6. บันทึกผลการวัดระดับน้ำลงในตาราง WaterMeasurement เพื่อให้อัปเดต Telemetry ล่าสุดของระบบ
        try:
            from models.measurement import WaterMeasurement
            target_stn = station_code
            if not target_stn:
                note_str = (station_note or "").upper()
                if "MUANGKONG" in note_str or "ม่วงก็อง" in (station_note or "") or "173" in note_str:
                    target_stn = "STN-MUANGKONG"
                elif "BANGSALA" in note_str or "บางศาลา" in (station_note or "") or "90" in note_str:
                    target_stn = "STN-BANGSALA"
                elif "HATYAI" in note_str or "หาดใหญ่" in (station_note or "") or "44" in note_str:
                    target_stn = "STN-HATYAINAI"
                else:
                    target_stn = "STN-BANGSALA"

            meas = WaterMeasurement(
                station_code=target_stn,
                timestamp=datetime.utcnow(),
                water_level=calculated_level_m,
                source_type="ON_DEMAND_VISION",
                vision_confidence=confidence_score,
                is_reviewed_by_human=False
            )
            db.add(meas)
            db.commit()
            db.refresh(meas)
        except Exception as e:
            print(f"[OnDemandVisionService] Note: Could not record WaterMeasurement: {e}")

        return OnDemandPredictResponse(
            status="SUCCESS",
            calculated_water_level_m=calculated_level_m,
            pixel_water_y_cropped=best_y_crop,
            pixel_water_y_original=y_water_orig,
            confidence_score=confidence_score,
            preview_image_base64=preview_b64,
            label_studio_task_id=task_id,
            minio_image_path=minio_path,
            scale_cm_per_pixel=round(scale_m_per_px * 100, 2)
        )

    @classmethod
    def _save_to_minio_and_label_studio(
        cls,
        image_bytes: bytes,
        orig_w: int,
        orig_h: int,
        bbox: BoundingBox,
        y_water_orig: int,
        db: Session,
        station_note: str
    ) -> Tuple[Optional[int], Optional[str]]:
        task_id = None
        minio_path = None
        filename = f"ondemand_{uuid.uuid4().hex[:10]}.jpg"

        # 1. บันทึกภาพต้นฉบับขึ้น MinIO Storage
        try:
            from core.config import settings
            bucket = settings.bucket_raw_images
            minio_path = minio_service.upload_image_bytes(
                bucket_name=bucket,
                object_name=f"ondemand/{filename}",
                data=image_bytes,
                content_type="image/jpeg"
            )
        except Exception as e:
            print(f"[OnDemandVisionService] MinIO upload note: {e}")

        # URL สำหรับ Label Studio อ้างอิง
        image_url = f"http://localhost:9000/raw-camera-images/ondemand/{filename}" if minio_path else f"/data/upload/ondemand/{filename}"

        # 2. แปลงพิกัดเป็น Percentage (0-100%) สำหรับ Label Studio
        box_x_pct = round((bbox.x / float(orig_w)) * 100.0, 2)
        box_y_pct = round((bbox.y / float(orig_h)) * 100.0, 2)
        box_w_pct = round((bbox.width / float(orig_w)) * 100.0, 2)
        box_h_pct = round((bbox.height / float(orig_h)) * 100.0, 2)
        water_x_pct = round(((bbox.x + bbox.width / 2.0) / float(orig_w)) * 100.0, 2)
        water_y_pct = round((y_water_orig / float(orig_h)) * 100.0, 2)

        # 3. สร้าง Pre-annotations โครงสร้าง Label Studio (เฉพาะคลาสเดียวคือ Staff Gauge)
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
                "original_width": orig_w,
                "original_height": orig_h
            }
        ]

        # 4. บันทึกลงตาราง task และ prediction ใน Label Studio (Project ID 2)
        try:
            now_iso = datetime.utcnow().isoformat()
            task_data = json.dumps({
                "image": image_url,
                "station_name": station_note,
                "source": "ON_DEMAND_PREDICTOR",
                "captured_at": now_iso
            })

            # สร้าง Task
            insert_task_sql = text("""
                INSERT INTO task (
                    data, project_id, created_at, updated_at, 
                    overlap, inner_id, total_predictions, total_annotations,
                    cancelled_annotations, comment_count, unresolved_comment_count, is_labeled
                )
                VALUES (
                    :data, 2, NOW(), NOW(), 
                    1, COALESCE((SELECT MAX(inner_id) FROM task WHERE project_id = 2), 0) + 1, 
                    1, 0, 0, 0, 0, FALSE
                )
                RETURNING id;
            """)
            result = db.execute(insert_task_sql, {"data": task_data})
            task_row = result.fetchone()
            if task_row:
                task_id = task_row[0]

                # สร้าง Pre-annotation Prediction สำหรับให้ผู้ตรวจทานมนุษย์เปิดตรวจทานใน Label Studio
                insert_pred_sql = text("""
                    INSERT INTO prediction (
                        task_id, project_id, result, score, model_version, mislabeling, created_at, updated_at
                    )
                    VALUES (:tid, 2, :result, 0.91, 'OnDemand-v1', 0.0, NOW(), NOW())
                    RETURNING id;
                """)
                db.execute(insert_pred_sql, {
                    "tid": task_id,
                    "result": json.dumps(prediction_result)
                })
                db.commit()
                print(f"[OnDemandVisionService] 🎯 Created Pending Label Studio Task #{task_id} with Pre-annotations (Awaiting Human Review)")
        except Exception as e:
            db.rollback()
            print(f"[OnDemandVisionService] Label Studio direct DB integration note: {e}")

        return task_id, minio_path

ondemand_vision_service = OnDemandVisionService()
