from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class AlertBase(BaseModel):
    station_code: str
    severity_level: str
    trigger_water_level: float
    message: str

class AlertCreate(AlertBase):
    pass

class AlertResponse(AlertBase):
    id: int
    timestamp: datetime
    is_sent_line: bool
    sent_at: Optional[datetime]

    class Config:
        from_attributes = True
