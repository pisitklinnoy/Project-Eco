import os
from typing import Literal
from pydantic import Field
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    app_name: str = "Hatyai FloodLens API"
    app_version: str = "1.0.0"
    
    # Database
    postgres_user: str = os.getenv("POSTGRES_USER", "admin")
    postgres_password: str = os.getenv("POSTGRES_PASSWORD", "password123")
    postgres_db: str = os.getenv("POSTGRES_DB", "hatyai_flood_db")
    postgres_host: str = os.getenv("POSTGRES_HOST", "postgres")
    postgres_port: int = int(os.getenv("POSTGRES_PORT", 5432))
    database_url_override: str = Field(default="", validation_alias="DATABASE_URL")
    forecast_max_age_minutes: int = Field(default=120, ge=1, le=1440)
    forecast_model_family: Literal["delta", "level"] = "delta"
    forecast_model_dir: str | None = None
    
    @property
    def database_url(self) -> str:
        if self.database_url_override:
            return self.database_url_override.replace("postgresql://", "postgresql+psycopg2://", 1)
        return f"postgresql+psycopg2://{self.postgres_user}:{self.postgres_password}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"

    # Redis
    redis_host: str = os.getenv("REDIS_HOST", "redis")
    redis_port: int = int(os.getenv("REDIS_PORT", 6379))

    # MinIO
    minio_endpoint: str = os.getenv("MINIO_ENDPOINT", "minio:9000")
    minio_access_key: str = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
    minio_secret_key: str = os.getenv("MINIO_SECRET_KEY", "minioadmin")
    minio_secure: bool = False
    bucket_raw_images: str = "raw-camera-images"
    bucket_processed_images: str = "processed-camera-images"
    bucket_models: str = "flood-models"

    # MLflow
    mlflow_tracking_uri: str = os.getenv("MLFLOW_TRACKING_URI", "http://mlflow:5000")

    # LINE Bot
    line_channel_access_token: str = os.getenv("LINE_CHANNEL_ACCESS_TOKEN", "")
    line_channel_secret: str = os.getenv("LINE_CHANNEL_SECRET", "")
    line_target_user_or_group_id: str = os.getenv("LINE_TARGET_USER_OR_GROUP_ID", "")

    # OpenTelemetry
    otel_exporter_endpoint: str = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "otel-collector:4317")

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
