from pydantic import BaseModel, field_serializer
from typing import Optional
from datetime import datetime, timezone

class WaterMeasurementBase(BaseModel):
    station_code: str
    timestamp: datetime
    water_level: float
    source_type: str = "API"
    image_minio_path: Optional[str] = None
    vision_confidence: Optional[float] = None
    is_reviewed_by_human: bool = False

class WaterMeasurementCreate(WaterMeasurementBase):
    pass

class WaterMeasurementResponse(WaterMeasurementBase):
    id: int
    created_at: datetime

    @field_serializer("timestamp", "created_at")
    def serialize_utc(self, value: datetime):
        return value.replace(tzinfo=timezone.utc).isoformat() if value.tzinfo is None else value.isoformat()

    class Config:
        from_attributes = True

class RainfallMeasurementBase(BaseModel):
    station_code: str
    timestamp: datetime
    rain_amount_1h: float = 0.0
    rain_amount_24h: float = 0.0

class RainfallMeasurementResponse(RainfallMeasurementBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True
