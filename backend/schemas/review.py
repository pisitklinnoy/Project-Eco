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
