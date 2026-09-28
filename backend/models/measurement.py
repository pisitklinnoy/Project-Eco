from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean
from datetime import datetime
from core.database import Base

class WaterMeasurement(Base):
    __tablename__ = "water_measurements"

    id = Column(Integer, primary_key=True, index=True)
    station_code = Column(String(50), index=True, nullable=False)
    timestamp = Column(DateTime, index=True, nullable=False)
    water_level = Column(Float, nullable=False) # meters
    source_type = Column(String(50), default="API") # "API", "CAMERA_VISION", "MANUAL_REVIEW"
    
    # Image reference (if from camera)
    image_minio_path = Column(String(500), nullable=True)
    vision_confidence = Column(Float, nullable=True)
    is_reviewed_by_human = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class RainfallMeasurement(Base):
    __tablename__ = "rainfall_measurements"

    id = Column(Integer, primary_key=True, index=True)
    station_code = Column(String(50), index=True, nullable=False)
    timestamp = Column(DateTime, index=True, nullable=False)
    rain_amount_1h = Column(Float, default=0.0) # mm
    rain_amount_24h = Column(Float, default=0.0) # mm
    created_at = Column(DateTime, default=datetime.utcnow)
