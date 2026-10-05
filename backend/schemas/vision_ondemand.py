from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List

class BoundingBox(BaseModel):
    x: float = Field(..., description="พิกัดมุมซ้ายบนแกน X (พิกเซล)")
    y: float = Field(..., description="พิกัดมุมซ้ายบนแกน Y (พิกเซล)")
    width: float = Field(..., description="ความกว้างของกรอบเสา (พิกเซล)")
    height: float = Field(..., description="ความสูงของกรอบเสา (พิกเซล)")

class CalibrationPoint(BaseModel):
    x: float = Field(..., description="พิกัดแกน X (พิกเซล)")
    y: float = Field(..., description="พิกัดแกน Y (พิกเซล)")
    actual_meter: float = Field(..., description="ระดับความสูงจริงที่จุดนี้ (เมตร)")

class OnDemandPredictResponse(BaseModel):
    status: str
    calculated_water_level_m: float
    pixel_water_y_cropped: int
    pixel_water_y_original: int
    confidence_score: float
    preview_image_base64: str
    label_studio_task_id: Optional[int] = None
    minio_image_path: Optional[str] = None
    scale_cm_per_pixel: Optional[float] = None
