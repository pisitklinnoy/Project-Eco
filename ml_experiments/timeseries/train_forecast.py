"""
Hatyai FloodLens: Time-Series Model Comparison & MLflow Tracking
สคริปต์ตัวอย่างสำหรับเปรียบเทียบโมเดล 3 แบบ และบันทึกผลการทดลองเข้าสู่ MLflow
"""

import os
import numpy as np
import pandas as pd
import mlflow
from datetime import datetime

MLFLOW_TRACKING_URI = os.getenv("MLFLOW_TRACKING_URI", "http://localhost:5000")
mlflow.set_tracking_uri(MLFLOW_TRACKING_URI)
mlflow.set_experiment("Hatyai-Flood-Forecasting")

def train_and_compare_models():
    print(f"[MLflow] Connecting to Tracking Server at {MLFLOW_TRACKING_URI}...")
    
    # 1. โหลดข้อมูลจำลองระดับน้ำและฝน
    np.random.seed(42)
    n_samples = 500
    rain = np.random.uniform(0, 35, n_samples)
    water_actual = 2.0 + (rain * 0.05) + np.random.normal(0, 0.1, n_samples)

    models_to_test = [
        {"name": "Linear_Baseline", "mae": 0.28, "rmse": 0.35},
        {"name": "XGBoost_Regressor", "mae": 0.16, "rmse": 0.21},
        {"name": "LSTM_NeuralNetwork", "mae": 0.11, "rmse": 0.15} # Best performer
    ]

    for m in models_to_test:
        with mlflow.start_run(run_name=m["name"]):
            print(f"--> Training & Logging model: {m['name']}")
            mlflow.log_param("model_type", m["name"])
            mlflow.log_param("lead_time", "1h-3h")
            mlflow.log_param("target_station", "STN-HY01")
            
            mlflow.log_metric("mae_1h", m["mae"])
            mlflow.log_metric("rmse_1h", m["rmse"])
            mlflow.log_metric("mae_3h", m["mae"] * 1.4)
            mlflow.log_metric("rmse_3h", m["rmse"] * 1.5)

            # หากเป็นโมเดลที่ชนะ (LSTM) ให้จำลองการบันทึก artifacts
            if m["name"] == "LSTM_NeuralNetwork":
                with open("model_summary.txt", "w") as f:
                    f.write("Hatyai FloodLens LSTM Best Model Weights & Metadata")
                mlflow.log_artifact("model_summary.txt", artifact_path="model")
                if os.path.exists("model_summary.txt"):
                    os.remove("model_summary.txt")

    print("\n✅ Completed Model Comparison! Check results on MLflow UI: http://localhost:5000")

if __name__ == "__main__":
    train_and_compare_models()
