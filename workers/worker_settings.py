import os
from arq.connections import RedisSettings
from arq import cron
from ingestion.ingestion_worker import run_ingestion_cycle
from vision.vision_worker import process_vision_task
from forecast.forecast_worker import run_periodic_forecast
from notification.line_worker import send_async_line_notification

REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))

async def startup(ctx):
    print("\n=======================================================")
    print("🌊 [Hatyai FloodLens Workers] Initialized & Running")
    print("   - Scheduled Ingestion (API & CCTV Frames)")
    print("   - Computer Vision & Quality Gate")
    print("   - Time-Series Flood Forecasting Engine")
    print("   - LINE Messaging Notification Outbox")
    print("=======================================================\n")

async def shutdown(ctx):
    print("\n[Hatyai FloodLens Workers] Shutting down gracefully...")

class WorkerSettings:
    functions = [
        run_ingestion_cycle,
        process_vision_task,
        run_periodic_forecast,
        send_async_line_notification
    ]
    redis_settings = RedisSettings(host=REDIS_HOST, port=REDIS_PORT)
    on_startup = startup
    on_shutdown = shutdown

    # Periodic Scheduled Cron Jobs (ทุก 15 นาทีตามสเปคโครงงาน หรือปรับตามต้องการ)
    cron_jobs = [
        cron(run_ingestion_cycle, minute={0, 15, 30, 45}),
        cron(run_periodic_forecast, minute={1, 16, 31, 46})
    ]
