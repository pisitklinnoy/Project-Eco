from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime
from datetime import datetime
from core.database import Base

class Station(Base):
    __tablename__ = "stations"

    id = Column(Integer, primary_key=True, index=True)
    station_code = Column(String(50), unique=True, index=True, nullable=False)
    name = Column(String(200), nullable=False)
    location_name = Column(String(200), nullable=False) # e.g. สะพานท่าเคียน / คลองอู่ตะเภา
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    
    # Warning Thresholds (meters)
    normal_level = Column(Float, default=2.5)
    warning_level = Column(Float, default=3.5)
    critical_level = Column(Float, default=4.2)
    bank_level = Column(Float, default=5.0) # ตลิ่ง
    
    # Camera metadata
    camera_id = Column(String(50), nullable=True)
    camera_stream_url = Column(String(500), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
