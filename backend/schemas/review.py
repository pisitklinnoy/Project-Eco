from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class ReviewImageContext(BaseModel):
    snapshot_time: datetime
    image_url: str
    ai_detected_level: Optional[float]
    ai_confidence: Optional[float]
    rain_amount_1h: float
    api_water_level: Optional[float]

class ReviewPackageResponse(BaseModel):
    package_id: str
    station_code: str
    current_image_url: str
    historical_images: List[ReviewImageContext]
    reason_flagged: str # e.g. "LOW_CONFIDENCE", "NIGHT_IR_AMBIGUOUS", "HIGH_DELTA"
    created_at: datetime

class HumanReviewSubmit(BaseModel):
    measurement_id: int
    corrected_water_level: float
    reviewer_notes: Optional[str] = None
    is_valid_image: bool = True

class IngestionOverrideSubmit(BaseModel):
    review_id: str
    selected_choice: str = "MANUAL" # "VISION" | "SENSOR" | "MANUAL"
    verified_water_level: float
    reviewer_name: str = "Hydrologist Operator"
    reviewer_notes: Optional[str] = "Manual override by expert"

class IngestionSimulateRequest(BaseModel):
    station_code: str = "STN-BANGSALA"
    station_name: str = "บ้านบางศาลา"
    vision_water_level: float = 14.80
    sensor_water_level: float = 2.45

class DriftRetrainRequest(BaseModel):
    reviewer_name: str = "Hydrologist Engineer"
    reviewer_notes: Optional[str] = "Retrain requested after forecast drift inspection"

class DriftAcknowledgeRequest(BaseModel):
    reviewer_name: str = "Hydrologist Operator"
    reviewer_notes: Optional[str] = "Drift alert acknowledged. Continued monitoring."

class DriftSimulateRequest(BaseModel):
    residual_error: float = 0.65
