import os
import mlflow
from core.config import settings

class MLflowService:
    def __init__(self):
        self.tracking_uri = settings.mlflow_tracking_uri
        mlflow.set_tracking_uri(self.tracking_uri)

    def load_forecast_model(self, model_name: str = "Flood-Forecaster"):
        """
        โหลดโมเดล Time-Series พยากรณ์ระดับน้ำจาก MLflow Model Registry
        หากยังไม่มีโมเดลจริงของเพื่อน จะคืนค่า None เพื่อให้ใช้ Mock Forecaster
        """
        model_uri = f"models:/{model_name}/latest"
        try:
            print(f"[MLflow] Attempting to load model from: {model_uri}")
            model = mlflow.pyfunc.load_model(model_uri)
            print("[MLflow] Successfully loaded model from MLflow Registry!")
            return model
        except Exception as e:
            print(f"[MLflow] Model '{model_name}' not found yet in registry ({e}). Using Fallback Mock Engine.")
            return None

mlflow_service = MLflowService()
