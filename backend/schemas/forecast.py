from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ForecastBase(BaseModel):
    station_code: str
    forecast_time: datetime
    predicted_1h: float
    predicted_2h: float
    predicted_3h: float
    model_name: str = "Flood-Forecaster-v1"
    model_version: str = "1"
    input_mode: str = "API_PLUS_VISION"
    data_quality_status: str = "HIGH_CONFIDENCE"

class ForecastCreate(ForecastBase):
    pass

class ForecastResponse(ForecastBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

class ForecastComparisonItem(BaseModel):
    lead_time_hours: int
    predicted_level: float
    actual_level: Optional[float] = None
    mae_error: Optional[float] = None
