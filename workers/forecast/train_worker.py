"""
Time Series Training Worker: Automated Continuous Retraining & Champion Gatekeeper
==================================================================================
หน้าที่ของ Time Series Training Worker:
1. ดึงชุดข้อมูลโทรมาตรระดับน้ำและปริมาณฝนจาก PostgreSQL (รวมข้อมูลที่มนุษย์ Override/Review)
2. รวมเข้ากับ Baseline Master Data ในรูปแบบ Expanding Historical Window
3. รันการฝึกสอนโมเดล Challenger (LightGBM) พร้อมถ่วงน้ำหนักช่วงวิกฤตน้ำท่วม (Flood Sample Weight x2.5)
4. ตรวจสอบผ่านเกณฑ์ Champion vs Challenger Gatekeeper (< +5% MAE)
5. บันทึก Artifact และขึ้นทะเบียนโมเดลลงใน MLflow Model Registry ("Unified-LightGBM-Forecaster")
6. Deploy ทับโมเดล Production (unified_flood_model.txt) และสำรองใน Archive
"""

import os
import sys
import json
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, Any, Optional

BASE_DIR = Path(__file__).resolve().parent
WORKERS_DIR = BASE_DIR.parent
ROOT_DIR = WORKERS_DIR.parent

if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
if str(ROOT_DIR / "backend") not in sys.path:
    sys.path.insert(0, str(ROOT_DIR / "backend"))
if str(ROOT_DIR / "TimeSeries-Integration") not in sys.path:
    sys.path.insert(0, str(ROOT_DIR / "TimeSeries-Integration"))


def run_timeseries_training_job(trigger_type: str = "MANUAL_STANDALONE", force_promote: bool = False) -> Dict[str, Any]:
    """
    Main Entrypoint: ฟังก์ชันการทำงานหลักของ Time Series Training Worker
    """
    print(f"\n=======================================================")
    print(f"🌊 [TSTrainingWorker] Starting Time-Series Retraining Cycle (Trigger: {trigger_type})")
    print(f"=======================================================")

    try:
        from services.timeseries_retrain_service import TimeSeriesRetrainService
        result = TimeSeriesRetrainService.execute_retrain_job(
            trigger_type=trigger_type,
            force_promote=force_promote
        )
        print(f"[TSTrainingWorker] ✅ Retrain finished. Promoted: {result.get('promoted')}, Version: {result.get('model_version')}")
        return result
    except Exception as e:
        print(f"[TSTrainingWorker] ⚠️ Retraining error: {e}")
        # Fallback to direct pipeline execution
        from time_series_ecosystem.retraining_pipeline import run_retrain_pipeline
        csv_path = ROOT_DIR / "time_series_ecosystem" / "sample_data.csv"
        model_save_path = ROOT_DIR / "time_series_ecosystem" / "models" / "unified_flood_model.txt"
        res = run_retrain_pipeline(
            csv_path=str(csv_path),
            model_save_path=str(model_save_path),
            force_promote=force_promote
        )
        return {
            "status": "fallback_success",
            "promoted": res.get("promoted"),
            "challenger_mae": res.get("challenger_mae"),
            "champion_mae": res.get("champion_mae"),
            "trigger_type": trigger_type
        }


# ฟังก์ชันสำหรับ ARQ Worker เรียกใช้งานผ่าน Redis Queue
async def run_timeseries_training_task(ctx, trigger_type: str = "AUTO_REDIS", force_promote: bool = False):
    return run_timeseries_training_job(trigger_type=trigger_type, force_promote=force_promote)


if __name__ == "__main__":
    trigger = sys.argv[1] if len(sys.argv) > 1 else "MANUAL_CLI"
    res = run_timeseries_training_job(trigger_type=trigger)
    print("Result:", json.dumps(res, indent=2, default=str))
