from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class StationBase(BaseModel):
    station_code: str
    name: str
    location_name: str
    latitude: float
    longitude: float
    normal_level: float = 2.5
    warning_level: float = 3.5
    critical_level: float = 4.2
    bank_level: float = 5.0
    camera_id: Optional[str] = None
    camera_stream_url: Optional[str] = None
    is_active: bool = True

class StationCreate(StationBase):
    pass

class StationResponse(StationBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True
