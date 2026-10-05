"""
Hatyai FloodLens: Real Label Studio to MLflow Sync & Evaluation Pipeline
เชื่อมโยงวงจร Human-in-the-Loop ของจริง (Label Studio DB -> Real Evaluation -> MLflow)
ไม่มีการใช้ Mock Data ใดๆ ทั้งสิ้น
"""

import os
import sys
import json
import psycopg2
from datetime import datetime
from services.review_service import review_service

# Database & MLflow Configurations
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "postgres")
POSTGRES_PORT = int(os.getenv("POSTGRES_PORT", 5432))
POSTGRES_USER = os.getenv("POSTGRES_USER", "admin")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "password123")
POSTGRES_DB = os.getenv("POSTGRES_DB", "hatyai_flood_db")
MLFLOW_TRACKING_URI = os.getenv("MLFLOW_TRACKING_URI", "http://mlflow:5000")


def fetch_and_evaluate_real_annotations():
    """
    ดึงข้อมูล Annotation ที่มนุษย์ตรวจจริงจากตารางของ Label Studio ใน PostgreSQL
    และส่งประเมินผลเทียบกับ AI Prediction เข้าสู่ MLflow จริง
    """
    print(f"[Pipeline] 📥 Connecting to Label Studio Database at {POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}...")

    conn = psycopg2.connect(
        dbname=POSTGRES_DB,
        user=POSTGRES_USER,
        password=POSTGRES_PASSWORD,
        host=POSTGRES_HOST,
        port=POSTGRES_PORT
    )
    cur = conn.cursor()

    # Query tasks from Project 2 along with completed annotations and AI predictions
    query = """
        SELECT 
            t.id, 
            t.data, 
            p.result as ai_result, 
            c.result as completed_result,
            d.result as draft_result
        FROM task t
        LEFT JOIN prediction p ON p.task_id = t.id
        LEFT JOIN task_completion c ON c.task_id = t.id
        LEFT JOIN tasks_annotationdraft d ON d.task_id = t.id
        WHERE t.project_id = 2
        ORDER BY t.id
    """
    cur.execute(query)
    rows = cur.fetchall()
    conn.close()

    print(f"[Pipeline] 🔍 Checked {len(rows)} tasks in Label Studio Project 2")

    reviewed_count = 0
    for row in rows:
        task_id = row[0]
        task_data = row[1] if isinstance(row[1], dict) else {}
        ai_result = row[2]
        completed_result = row[3]
        draft_result = row[4]

        # เลือกใช้ผลที่คนกด Submit เป็นอันดับแรก หรือใช้ Draft ที่คนกำลังตรวจอยู่
        human_result = completed_result or draft_result
        if not human_result:
            continue

        station_name = task_data.get("station_name", f"Station_Task_{task_id}")
        source_type = "COMPLETED" if completed_result else "DRAFT"

        print(f"\n[Pipeline] ⚡ Processing Task {task_id} ({station_name}) [{source_type}]...")
        result = review_service.evaluate_and_log_to_mlflow(
            task_id=task_id,
            station_name=station_name,
            human_result=human_result,
            ai_result=ai_result or [],
            reviewer="hydrologist_operator"
        )
        print(f"   • Human Verified Level: {result['verified_water_level_m']} m")
        print(f"   • AI Detected Level:   {result['ai_detected_water_level_m']} m")
        print(f"   • Error MAE:           {result['water_level_mae_meters']} m (~{result['water_level_mae_meters']*100:.1f} cm)")
        print(f"   • Pixel Diff:          {result['pixel_error_px']} px")
        print(f"   • Staff Gauge IoU:     {result['iou_staff_gauge']}")
        print(f"   • MLflow Run ID:       {result['mlflow_run_id']}")
        reviewed_count += 1

    if reviewed_count == 0:
        print("\n[Pipeline] ⚠️ No reviewed tasks found in Label Studio yet.")
        print("[Pipeline] 👉 Please visit http://localhost:8085, adjust labels and click [Submit] to record human reviews.")
    else:
        print(f"\n✅ [Pipeline] Successfully processed {reviewed_count} real human reviewed task(s) into MLflow!")
        print(f"👉 View in MLflow UI: http://localhost:5000")


if __name__ == "__main__":
    fetch_and_evaluate_real_annotations()
