from pydantic import BaseModel, Field, field_serializer
from datetime import timezone
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
    context_json: Optional[dict] = None

    @field_serializer("forecast_time", "created_at")
    def serialize_utc(self, value: datetime):
        return value.replace(tzinfo=timezone.utc).isoformat() if value.tzinfo is None else value.isoformat()

    class Config:
        from_attributes = True

class ForecastComparisonItem(BaseModel):
    lead_time_hours: int
    predicted_level: float
    actual_level: Optional[float] = None
    mae_error: Optional[float] = None
    target_time: Optional[str] = None


class ReplayForecastInput(BaseModel):
    issue_time: datetime
    observations: list[dict] = Field(min_length=1, max_length=1000)


class ForecastComparisonResponse(BaseModel):
    forecast_id: int
    station_code: str
    items: list[ForecastComparisonItem]
