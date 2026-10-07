import os
import io
import asyncio
import requests
from datetime import datetime
from minio import Minio
from ingestion.camera_fetcher import camera_fetcher

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")

DB_HOST = os.getenv("POSTGRES_HOST", "postgres")
DB_USER = os.getenv("POSTGRES_USER", "admin")
DB_PASS = os.getenv("POSTGRES_PASSWORD", "password123")
DB_NAME = os.getenv("POSTGRES_DB", "hatyai_flood_db")

REAL_STATIONS = [
    {"code": "STN-BANGSALA", "cam": "CAM-BANGSALA", "name": "บางศาลา"},
    {"code": "STN-MUANGKONG", "cam": "CAM-MUANGKONG", "name": "ม่วงก็อง"},
    {"code": "STN-HATYAINAI", "cam": "CAM-HATYAINAI", "name": "หาดใหญ่ใน"},
]


def ingest_rid_telemetry():
    base = os.getenv("BACKEND_API_URL", "http://backend:8000").rstrip("/")
    try:
        response = requests.post(base + "/api/v1/water/ingest-telemetry", timeout=(5, 180))
        response.raise_for_status()
        return response.json()
    except (requests.RequestException, ValueError) as exc:
        print(f"[Ingestion Worker] RID telemetry unavailable: {exc}")
        return {"status": "unavailable", "reason": str(exc)}

async def run_ingestion_cycle(ctx, station_code: str = None):
    """
    Task handler สำหรับการดึงข้อมูลภาพกล้อง CCTV สดและข้อมูลฝนของทั้ง 3 สถานี
    """
    targets = [s for s in REAL_STATIONS if s["code"] == station_code] if station_code else REAL_STATIONS
    # Always ingest all upstream stations before camera processing; forecasting uses these hourly reports.
    telemetry_result = await asyncio.to_thread(ingest_rid_telemetry)

    print(f"\n[Ingestion Worker] 📥 Starting ingestion cycle for {len(targets)} station(s)...")

    minio_client = Minio(MINIO_ENDPOINT, access_key=MINIO_ACCESS_KEY, secret_key=MINIO_SECRET_KEY, secure=False)
    bucket = "raw-camera-images"
    try:
        if not minio_client.bucket_exists(bucket):
            minio_client.make_bucket(bucket)
    except Exception as e:
        print(f"[Ingestion Worker] MinIO bucket check note: {e}")

    results = []

    for stn in targets:
        stn_code = stn["code"]
        cam_id = stn["cam"]
        print(f"\n[Ingestion Worker] 📸 Ingesting station: {stn['name']} ({stn_code})...")

        # 1. จับภาพเฟรมกล้องสดจาก hatyaicityclimate.org
        img_bytes = camera_fetcher.capture_frame(camera_id=cam_id)
        now_str = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        object_name = f"{stn_code}/{now_str}.jpg"

        # 2. บันทึกรูปต้นฉบับลง MinIO
        try:
            minio_client.put_object(
                bucket,
                object_name,
                io.BytesIO(img_bytes),
                length=len(img_bytes),
                content_type="image/jpeg"
            )
            print(f"[Ingestion Worker] 💾 Saved camera frame to MinIO: {bucket}/{object_name}")
        except Exception as e:
            print(f"[Ingestion Worker] MinIO upload error for {stn_code}: {e}")

        # Verified HII hourly rain was ingested above, independently of camera processing.

        # 4. ส่งต่อให้ AI Staff Gauge Detection ประมวลผลภาพ (YOLO model_best_v2.pt + Quality Gate + Label Studio)
        try:
            base = os.getenv("BACKEND_API_URL", "http://backend:8000").rstrip("/")
            res = requests.get(f"{base}/api/v1/stations/{stn_code}/detection-status?mode=live", timeout=(5, 60))
            if res.status_code == 200:
                task_res = res.json()
                print(f"[Ingestion Worker] 🎯 AI Staff Gauge Detection for {stn_code}: conf={task_res.get('confidence')} water_level={task_res.get('water_level')}m")
                results.append(task_res)
            else:
                print(f"[Ingestion Worker] ⚠️ AI Detection API returned {res.status_code} for {stn_code}")
        except Exception as e:
            print(f"[Ingestion Worker] ⚠️ AI Detection API error for {stn_code}: {e}")

    print(f"\n[Ingestion Worker] ✅ Ingestion cycle completed for all {len(targets)} stations.")
    return {"status": "success", "processed_stations": len(results), "telemetry": telemetry_result}
