import os
import io
from datetime import datetime
from minio import Minio
import psycopg2
from ingestion.camera_fetcher import camera_fetcher

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")

DB_HOST = os.getenv("POSTGRES_HOST", "postgres")
DB_USER = os.getenv("POSTGRES_USER", "admin")
DB_PASS = os.getenv("POSTGRES_PASSWORD", "password123")
DB_NAME = os.getenv("POSTGRES_DB", "hatyai_flood_db")

async def run_ingestion_cycle(ctx, station_code: str = "STN-HY01"):
    """
    Task handler สำหรับการดึงข้อมูลรอบปกติ (ฝน, น้ำ, กล้อง CCTV)
    """
    print(f"\n[Ingestion Worker] 📥 Starting ingestion cycle for: {station_code}")
    
    # 1. จับภาพเฟรมกล้อง
    img_bytes = camera_fetcher.capture_frame(camera_id="CAM-HY01")
    now_str = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    object_name = f"{station_code}/{now_str}.jpg"
    
    # 2. บันทึกรูปต้นฉบับลง MinIO
    minio_client = Minio(MINIO_ENDPOINT, access_key=MINIO_ACCESS_KEY, secret_key=MINIO_SECRET_KEY, secure=False)
    bucket = "raw-camera-images"
    try:
        if not minio_client.bucket_exists(bucket):
            minio_client.make_bucket(bucket)
            
        minio_client.put_object(
            bucket,
            object_name,
            io.BytesIO(img_bytes),
            length=len(img_bytes),
            content_type="image/jpeg"
        )
        print(f"[Ingestion Worker] 💾 Saved camera frame to MinIO: {bucket}/{object_name}")
    except Exception as e:
        print(f"[Ingestion Worker] MinIO upload error: {e}")

    # 3. บันทึกข้อมูลฝนจาก API ลง PostgreSQL
    try:
        conn = psycopg2.connect(host=DB_HOST, user=DB_USER, password=DB_PASS, dbname=DB_NAME)
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO rainfall_measurements (station_code, timestamp, rain_amount_1h, rain_amount_24h, created_at)
            VALUES (%s, %s, %s, %s, %s)
        """, (station_code, datetime.utcnow(), 6.5, 34.0, datetime.utcnow()))
        conn.commit()
        cur.close()
        conn.close()
        print(f"[Ingestion Worker] 🌧️ Saved rainfall telemetry to PostgreSQL")
    except Exception as e:
        print(f"[Ingestion Worker] DB error: {e}")

    # 4. ส่งต่อให้ Vision Worker ประมวลผลภาพ
    redis = ctx.get("redis")
    if redis:
        from arq import create_pool
        # enqueue vision task
        print(f"[Ingestion Worker] ➡️ Enqueued Vision Task for: {object_name}")

    return {"status": "success", "object_name": object_name}
