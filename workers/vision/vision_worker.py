import os
import psycopg2
from minio import Minio
from vision.mock_detector import mock_detector
from vision.quality_gate import QualityGate
from datetime import datetime

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")

DB_HOST = os.getenv("POSTGRES_HOST", "postgres")
DB_USER = os.getenv("POSTGRES_USER", "admin")
DB_PASS = os.getenv("POSTGRES_PASSWORD", "password123")
DB_NAME = os.getenv("POSTGRES_DB", "hatyai_flood_db")

async def process_vision_task(ctx, payload: dict):
    """
    Task handler สำหรับประมวลผลระดับน้ำจากภาพกล้อง CCTV
    """
    station_code = payload.get("station_code", "STN-HY01")
    image_bucket = payload.get("bucket", "raw-camera-images")
    object_name = payload.get("object_name")

    print(f"\n[Vision Worker] 📸 Processing camera frame: {object_name} ({station_code})")
    
    minio_client = Minio(MINIO_ENDPOINT, access_key=MINIO_ACCESS_KEY, secret_key=MINIO_SECRET_KEY, secure=False)
    
    try:
        res = minio_client.get_object(image_bucket, object_name)
        img_bytes = res.read()
        res.close()
        res.release_conn()
    except Exception as e:
        print(f"[Vision Worker] Error downloading frame from MinIO: {e}")
        return {"status": "error", "message": str(e)}

    # รันโมเดลตรวจวัดผิวน้ำ
    detect_res = mock_detector.detect_water_level(img_bytes, station_code=station_code)
    
    # ตรวจสอบผ่าน Quality Gate
    q_eval = QualityGate.evaluate(img_bytes, detect_res, station_code=station_code)
    print(f"[Vision Worker] Quality Gate Status: {q_eval['status']} (Reason: {q_eval['reason']})")

    # บันทึกผลลัพธ์ลง PostgreSQL
    try:
        conn = psycopg2.connect(host=DB_HOST, user=DB_USER, password=DB_PASS, dbname=DB_NAME)
        cur = conn.cursor()
        
        cur.execute("""
            INSERT INTO water_measurements (station_code, timestamp, water_level, source_type, image_minio_path, vision_confidence, is_reviewed_by_human, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            station_code,
            datetime.utcnow(),
            detect_res["water_level"],
            "CAMERA_VISION",
            f"{image_bucket}/{object_name}",
            detect_res["confidence"],
            False,
            datetime.utcnow()
        ))
        conn.commit()
        cur.close()
        conn.close()
        print(f"[Vision Worker] ✅ Water measurement saved: {detect_res['water_level']}m (Conf: {detect_res['confidence']})")
    except Exception as e:
        print(f"[Vision Worker] Database insert warning: {e}")

    return {
        "station_code": station_code,
        "water_level": detect_res["water_level"],
        "confidence": detect_res["confidence"],
        "quality_status": q_eval["status"]
    }
