from sqlalchemy import Column, Integer, String, Float, DateTime, JSON
from datetime import datetime
from core.database import Base

class ForecastRecord(Base):
    __tablename__ = "forecast_records"

    id = Column(Integer, primary_key=True, index=True)
    station_code = Column(String(50), index=True, nullable=False)
    forecast_time = Column(DateTime, index=True, nullable=False) # เวลาที่ทำการออกผลพยากรณ์
    
    # Target Predictions (meters)
    predicted_1h = Column(Float, nullable=False)
    predicted_2h = Column(Float, nullable=False)
    predicted_3h = Column(Float, nullable=False)

    # Metadata & Quality Control
    model_name = Column(String(100), default="Flood-Forecaster-v1")
    model_version = Column(String(50), default="1")
    input_mode = Column(String(50), default="API_PLUS_VISION") # "API_ONLY", "API_PLUS_VISION", "FALLBACK"
    data_quality_status = Column(String(50), default="HIGH_CONFIDENCE")
    context_json = Column(JSON, nullable=True)
    forecast_key = Column(String(64), nullable=True, unique=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
