from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, Text
from datetime import datetime
from core.database import Base

class AlertEvent(Base):
    __tablename__ = "alert_events"

    id = Column(Integer, primary_key=True, index=True)
    station_code = Column(String(50), index=True, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    severity_level = Column(String(50), nullable=False) # "INFO", "WARNING", "CRITICAL"
    trigger_water_level = Column(Float, nullable=False)
    message = Column(Text, nullable=False)
    
    # Notification Delivery Status
    is_sent_line = Column(Boolean, default=False)
    line_response_code = Column(Integer, nullable=True)
    sent_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
