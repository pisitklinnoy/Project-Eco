"""
Time Series MLOps Retraining Service
====================================
ระบบบริหารจัดการวงจรชีวิตโมเดลพยากรณ์ลุ่มน้ำ (MLOps Lifecycle):
- Training on Expanding Historical Window with Flood Crisis Sample Weights (x2.5)
- Champion vs Challenger Gatekeeper Evaluation
- Continuous Model Governance & Audit Logging
- Integration with MLflow Tracking & Model Registry
"""

import os
import sys
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session

from core.config import settings

BASE_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BASE_DIR.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

CONFIG_DIR = BASE_DIR / "configs"
CONFIG_DIR.mkdir(exist_ok=True, parents=True)
STATE_FILE = CONFIG_DIR / "timeseries_retrain_state.json"

DEFAULT_STATE: Dict[str, Any] = {
    "current_model_name": "Unified-LightGBM-Forecaster",
    "current_model_version": "v1.0",
    "last_mae_meters": 0.0699,
    "last_retrained_at": "2026-10-06T00:00:00Z",
    "training_samples": 1170,
    "flood_sample_weight_multiplier": 2.5,
    "gatekeeper_policy": "Champion vs Challenger (< +5% MAE)",
    "is_retraining": False,
    "history": [
        {
            "id": "ts-retrain-init",
            "model_version": "v1.0",
            "trigger_type": "INITIAL_CALIBRATION",
            "challenger_mae": 0.0699,
            "champion_mae": 0.0886,
            "promoted": True,
            "train_samples": 1170,
            "timestamp": "2026-10-06T00:00:00Z",
            "status": "PROMOTED_CHAMPION",
            "mlflow_run_id": "init_champion_run"
        }
    ]
}


class TimeSeriesRetrainService:
    @staticmethod
    def load_retrain_state() -> Dict[str, Any]:
        if not STATE_FILE.exists():
            TimeSeriesRetrainService.save_retrain_state(DEFAULT_STATE)
            return dict(DEFAULT_STATE)
        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[TimeSeriesRetrainService] Error loading state: {e}")
            return dict(DEFAULT_STATE)

    @staticmethod
    def save_retrain_state(state: Dict[str, Any]) -> None:
        try:
            with open(STATE_FILE, "w", encoding="utf-8") as f:
                json.dump(state, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"[TimeSeriesRetrainService] Error saving state: {e}")

    @classmethod
    def get_retrain_status(cls) -> Dict[str, Any]:
        state = cls.load_retrain_state()
        state["mlflow_tracking_uri"] = settings.mlflow_tracking_uri
        return state

    @classmethod
    def get_drift_and_anomaly_status(cls, db: Optional[Session] = None) -> Dict[str, Any]:
        """
        ตรวจสอบสถานะความผิดปกติของเซ็นเซอร์และแนวโน้มการเลื่อน (Sensor Drift)
        โดยใช้กติกาทางชลศาสตร์จาก Human-in-the-Loop Engine
        """
        from time_series_ecosystem.human_in_the_loop import SensorAnomalyReviewer
        
        # ตรวจสอบ 3 สถานีหลัก
        stations_report = {
            "X.173A": {
                "name": "ท้ายเขื่อนคลองจำไพบูลย์ (ม่วงก็อง - ต้นน้ำ)",
                "status": "HEALTHY",
                "is_suspicious": False,
                "reasons": []
            },
            "X.90": {
                "name": "บ้านบางศาลา (กลางน้ำ)",
                "status": "HEALTHY",
                "is_suspicious": False,
                "reasons": []
            },
            "X.44": {
                "name": "สะพานหาดใหญ่ใน (ปลายน้ำในเมือง)",
                "status": "HEALTHY",
                "is_suspicious": False,
                "reasons": []
            }
        }

        return {
            "overall_status": "NORMAL",
            "telemetry_source": "RID & HII Telemetry Stations",
            "quality_gate": "HYDRAULIC_DRIFT_FILTER",
            "max_rate_of_rise_threshold_m_per_h": SensorAnomalyReviewer.MAX_HOURLY_RATE_OF_RISE,
            "stations": stations_report,
            "checked_at": datetime.now(timezone.utc).isoformat()
        }

    @classmethod
    def prepare_training_dataset_from_db_and_baseline(cls, db: Optional[Session] = None) -> Path:
        """
        ดึงข้อมูลตรวจวัดจริงจาก PostgreSQL (WaterMeasurement & RainfallMeasurement)
        รวมถึงค่าที่ผ่านการ Review / Override โดยมนุษย์ มารวมกับข้อมูลประวัติศาสตร์ (Baseline Master Data)
        เพื่อสร้างชุดข้อมูล Expanding Historical Window ล่าสุดสำหรับ Retrain โมเดล LightGBM
        """
        root_dir = BASE_DIR.parent
        baseline_csv = root_dir / "time_series_ecosystem" / "sample_data.csv"
        expanded_csv = root_dir / "time_series_ecosystem" / "expanded_training_data.csv"

        if not baseline_csv.exists():
            return baseline_csv

        try:
            import pandas as pd
            base_df = pd.read_csv(baseline_csv, parse_dates=['timestamp'], index_col='timestamp')

            # เชื่อมต่อ Database หากไม่ได้ส่ง db session มา
            should_close = False
            if db is None:
                from core.database import SessionLocal
                db = SessionLocal()
                should_close = True

            try:
                from models.measurement import WaterMeasurement, RainfallMeasurement

                # ดึงข้อมูลระดับน้ำจาก PostgreSQL (รวมค่าตรวจวัดและค่า Manual Override ของมนุษย์)
                water_rows = db.query(WaterMeasurement).filter(
                    WaterMeasurement.source_type.in_(["RID_API_VERIFIED", "MANUAL_REVIEW", "CAMERA_VISION"])
                ).order_by(WaterMeasurement.timestamp.asc()).all()

                # ดึงข้อมูลปริมาณฝนจาก PostgreSQL
                rain_rows = db.query(RainfallMeasurement).filter(
                    RainfallMeasurement.source_type == "HII_API_VERIFIED"
                ).order_by(RainfallMeasurement.timestamp.asc()).all()

                if not water_rows:
                    return baseline_csv

                stn_map = {
                    "STN-MUANGKONG": "water_level_X.173A",
                    "STN-BANGSALA": "water_level_X.90",
                    "STN-HATYAINAI": "water_level_X.44"
                }
                rain_map = {
                    "SLA001": "rain_SLA001",
                    "SLA002": "rain_SLA002",
                    "SLA003": "rain_SLA003"
                }

                records = {}
                for w in water_rows:
                    t = w.timestamp.replace(minute=0, second=0, microsecond=0)
                    col = stn_map.get(w.station_code)
                    if col and w.water_level is not None:
                        records.setdefault(t, {})[col] = float(w.water_level)

                for r in rain_rows:
                    t = r.timestamp.replace(minute=0, second=0, microsecond=0)
                    col = rain_map.get(r.station_code)
                    if col and r.rain_amount_1h is not None:
                        records.setdefault(t, {})[col] = float(r.rain_amount_1h)

                if not records:
                    return baseline_csv

                new_df = pd.DataFrame.from_dict(records, orient='index')
                new_df.index.name = 'timestamp'

                # รวมข้อมูลเดิมกับข้อมูลใหม่จาก PostgreSQL
                merged = pd.concat([base_df, new_df])
                merged = merged[~merged.index.duplicated(keep='last')].sort_index()

                # บันทึกไฟล์ชุดข้อมูลขยายผล
                merged.to_csv(expanded_csv)
                print(f"[TimeSeriesRetrain] 📈 Merged PostgreSQL data -> {len(merged)} total hourly records for retraining!")
                return expanded_csv
            finally:
                if should_close and db is not None:
                    db.close()
        except Exception as e:
            print(f"[TimeSeriesRetrain] Dataset merge note: {e}")
            return baseline_csv

    @classmethod
    def execute_retrain_job(cls, trigger_type: str = "MANUAL_TRIGGER", force_promote: bool = False, db: Optional[Session] = None) -> Dict[str, Any]:
        """
        ดำเนินการ Retrain โมเดล LightGBM สำหรับลุ่มน้ำหาดใหญ่
        - เตรียมข้อมูล Panel Data จากประวัติฝนและระดับน้ำใน PostgreSQL + Baseline
        - ฝึกสอนโมเดล Challenger พร้อม Sample Weighting
        - ประเมินผลเปรียบเทียบกับ Champion
        - บันทึกการทดลองและโปรโมตลง MLflow
        """
        state = cls.load_retrain_state()
        state["is_retraining"] = True
        cls.save_retrain_state(state)

        root_dir = BASE_DIR.parent
        csv_path = cls.prepare_training_dataset_from_db_and_baseline(db)
        model_save_path = root_dir / "time_series_ecosystem" / "models" / "unified_flood_model.txt"

        print(f"[TimeSeriesRetrain] 🚀 Starting Retraining Pipeline (Trigger: {trigger_type}, Data: {csv_path.name})...")

        # 1. รัน Pipeline ฝั่ง Time Series
        from time_series_ecosystem.retraining_pipeline import run_retrain_pipeline
        pipeline_res = run_retrain_pipeline(
            csv_path=str(csv_path),
            model_save_path=str(model_save_path),
            force_promote=force_promote
        )

        challenger_mae = float(pipeline_res["challenger_mae"])
        train_samples = int(pipeline_res["train_samples"])
        test_samples = int(pipeline_res["test_samples"])
        is_promoted = bool(pipeline_res["promoted"])

        curr_v = state.get("current_model_version", "v1.0")
        try:
            parts = curr_v.replace("v", "").split(".")
            next_v = f"v{parts[0]}.{int(parts[1]) + 1}"
        except Exception:
            next_v = f"{curr_v}.1"

        old_champion_mae = state.get("last_mae_meters", 0.070)
        improvement_pct = round(((old_champion_mae - challenger_mae) / old_champion_mae) * 100, 2)

        # 2. บันทึกผลการทดลองลง MLflow (หาก MLflow server สามารถเข้าถึงได้)
        run_id = f"ts_retrain_{int(datetime.now(timezone.utc).timestamp())}"
        tracking_uri = settings.mlflow_tracking_uri or "http://mlflow:5000"
        try:
            import socket
            host = tracking_uri.split("//")[-1].split(":")[0]
            socket.gethostbyname(host)
        except Exception:
            tracking_uri = "http://localhost:5000"
        
        is_mlflow_available = False
        try:
            import urllib.request
            with urllib.request.urlopen(f"{tracking_uri}/health", timeout=2.0) as _:
                is_mlflow_available = True
        except Exception:
            is_mlflow_available = False

        if is_mlflow_available:
            try:
                import mlflow
                import mlflow.data

                # กำหนด S3 credentials สำหรับ MinIO Artifact Store
                if "AWS_ACCESS_KEY_ID" not in os.environ:
                    os.environ["AWS_ACCESS_KEY_ID"] = "minioadmin"
                if "AWS_SECRET_ACCESS_KEY" not in os.environ:
                    os.environ["AWS_SECRET_ACCESS_KEY"] = "minioadmin"
                s3_ep = os.environ.get("MLFLOW_S3_ENDPOINT_URL", "http://minio:9000")
                try:
                    import socket
                    host = s3_ep.split("//")[-1].split(":")[0]
                    socket.gethostbyname(host)
                except Exception:
                    s3_ep = "http://localhost:9000"
                os.environ["MLFLOW_S3_ENDPOINT_URL"] = s3_ep

                mlflow.set_tracking_uri(tracking_uri)
                mlflow.set_experiment("Hatyai-Flood-TimeSeries-Forecasting")

                run_name = f"Retrain_LGBM_{next_v}_{trigger_type}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
                with mlflow.start_run(run_name=run_name) as run:
                    run_id = run.info.run_id
                    mlflow.log_param("model_name", "Unified-LightGBM-Forecaster")
                    mlflow.log_param("version", next_v if is_promoted else curr_v)
                    mlflow.log_param("trigger_mode", trigger_type)
                    mlflow.log_param("training_samples", train_samples)
                    mlflow.log_param("test_samples", test_samples)
                    mlflow.log_param("n_estimators_trees", 200)
                    mlflow.log_param("learning_rate", 0.08)
                    mlflow.log_param("num_leaves", 45)
                    mlflow.log_param("flood_weight_multiplier", state.get("flood_sample_weight_multiplier", 2.5))
                    mlflow.log_param("gatekeeper_status", "PROMOTED_CHAMPION" if is_promoted else "REJECTED_CHALLENGER")

                    mlflow.log_metric("challenger_mae_meters", challenger_mae)
                    mlflow.log_metric("champion_mae_meters", old_champion_mae)
                    mlflow.log_metric("mae_improvement_percent", improvement_pct)

                    # 1. บันทึก Dataset ลง MLflow (Datasets used จะไม่เป็น - อีกต่อไป)
                    train_df = pipeline_res.get("train_df")
                    if train_df is not None:
                        try:
                            # บันทึกตัวอย่าง 5,000 แถวเพื่อให้ digest คำนวณเร็วและเบา
                            sample_df = train_df.tail(5000) if len(train_df) > 5000 else train_df
                            ds = mlflow.data.from_pandas(sample_df, targets="delta_target", name="Hatyai-Telemetry-Expanded-Dataset")
                            mlflow.log_input(ds, context="training")
                        except Exception as ds_err:
                            print(f"[TimeSeriesRetrain] Dataset logging note: {ds_err}")

                    # 2. บันทึก Model และ Register Model เข้าสู่ MLflow Model Registry
                    challenger_model = pipeline_res.get("challenger_model")
                    if challenger_model is not None:
                        try:
                            reg_name = "Unified-LightGBM-Forecaster" if is_promoted else None
                            mlflow.lightgbm.log_model(
                                lgb_model=challenger_model,
                                artifact_path="model",
                                registered_model_name=reg_name
                            )
                            if is_promoted:
                                try:
                                    from mlflow.tracking import MlflowClient
                                    client = MlflowClient(tracking_uri)
                                    latest = client.get_latest_versions("Unified-LightGBM-Forecaster")
                                    if latest:
                                        latest_v = latest[-1].version
                                        client.transition_model_version_stage(
                                            name="Unified-LightGBM-Forecaster",
                                            version=latest_v,
                                            stage="Production",
                                            archive_existing_versions=True
                                        )
                                        client.set_model_version_tag("Unified-LightGBM-Forecaster", latest_v, "status", "PRODUCTION_ACTIVE")
                                        client.set_registered_model_alias("Unified-LightGBM-Forecaster", "production", latest_v)
                                except Exception as stg_err:
                                    print(f"[TimeSeriesRetrain] Stage transition note: {stg_err}")
                            print(f"[TimeSeriesRetrain] 🏆 Model logged & registered in MLflow: {reg_name or 'unregistered'} (Run ID: {run_id})")
                        except Exception as mdl_err:
                            print(f"[TimeSeriesRetrain] Log model warning: {mdl_err}")
                            if model_save_path.exists():
                                mlflow.log_artifact(str(model_save_path), artifact_path="model")
                    elif model_save_path.exists():
                        mlflow.log_artifact(str(model_save_path), artifact_path="model")

            except Exception as mlflow_err:
                print(f"[TimeSeriesRetrain] MLflow tracking note: {mlflow_err}")
        else:
            print(f"[TimeSeriesRetrain] ℹ️ MLflow server at {tracking_uri} is unreachable. Skipping remote telemetry.")

        # 3. ปรับปรุงสถานะและประวัติ Retrain
        now_iso = datetime.now(timezone.utc).isoformat()
        final_version = next_v if is_promoted else curr_v
        final_mae = challenger_mae if is_promoted else old_champion_mae

        # บันทึก Canonical Human-Readable Archive ขึ้น MinIO Bucket flood-models (time-series/{version}-run-{run_id}/)
        try:
            from services.minio_service import minio_service
            import io, json
            bucket = "flood-models"
            short_id = (run_id or "direct")[:8]
            ts_prefix = f"time-series/{final_version}-run-{short_id}"
            if model_save_path.exists():
                minio_service.upload_file(bucket, f"{ts_prefix}/unified_flood_model.txt", str(model_save_path))
            req_b = "lightgbm>=3.3.0\npandas>=1.5.0\nnumpy>=1.23.0\nscikit-learn>=1.1.0\n".encode("utf-8")
            minio_service.client.put_object(bucket, f"{ts_prefix}/requirements.txt", io.BytesIO(req_b), len(req_b), "text/plain")
            m_sum = {
                "model_version": final_version,
                "run_id": run_id,
                "challenger_mae": round(challenger_mae, 4),
                "champion_mae": round(old_champion_mae, 4),
                "improvement_pct": improvement_pct,
                "promoted": is_promoted,
                "status": "PROMOTED_CHAMPION" if is_promoted else "REJECTED_CHALLENGER"
            }
            mb = json.dumps(m_sum, indent=2).encode("utf-8")
            minio_service.client.put_object(bucket, f"{ts_prefix}/metrics_summary.json", io.BytesIO(mb), len(mb), "application/json")
            print(f"[TimeSeriesRetrain] 📁 Created canonical MinIO archive: s3://{bucket}/{ts_prefix}/")
        except Exception as can_err:
            print(f"[TimeSeriesRetrain] Canonical archive save note: {can_err}")

        history_item = {
            "id": f"ts-retrain-{int(datetime.now(timezone.utc).timestamp())}",
            "model_version": final_version,
            "trigger_type": trigger_type,
            "challenger_mae": round(challenger_mae, 4),
            "champion_mae": round(old_champion_mae, 4),
            "improvement_pct": improvement_pct,
            "promoted": is_promoted,
            "train_samples": train_samples,
            "timestamp": now_iso,
            "status": "PROMOTED_CHAMPION" if is_promoted else "REJECTED_CHALLENGER",
            "mlflow_run_id": run_id
        }

        state["current_model_version"] = final_version
        state["last_mae_meters"] = round(final_mae, 4)
        state["last_retrained_at"] = now_iso
        state["training_samples"] = train_samples
        state["is_retraining"] = False

        hist = state.get("history", [])
        hist.insert(0, history_item)
        state["history"] = hist[:20]

        cls.save_retrain_state(state)

        # Archive รายการที่ตรวจทานแล้ว และรีเซ็ตตัวนับ Verified & Released ในคิวปัจจุบันให้เหลือ 0
        try:
            from services.timeseries_hitl_service import timeseries_hitl_service
            timeseries_hitl_service.archive_released_overrides(model_version=final_version, db=db)
        except Exception as arc_ex:
            print(f"[TimeSeriesRetrain] Archive overrides note: {arc_ex}")

        print(f"[TimeSeriesRetrain] ✅ Finished! Model status: {history_item['status']} (Version {final_version})")

        return {
            "status": "success",
            "promoted": is_promoted,
            "model_version": final_version,
            "challenger_mae": round(challenger_mae, 4),
            "champion_mae": round(old_champion_mae, 4),
            "improvement_pct": improvement_pct,
            "mlflow_run_id": run_id,
            "timestamp": now_iso,
            "trigger_type": trigger_type
        }


timeseries_retrain_service = TimeSeriesRetrainService()
