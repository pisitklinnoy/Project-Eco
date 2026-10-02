"""
Hatyai Flood Vision Core Module
ระบบประมวลผลภาพกล้อง CCTV ตรวจวัดระดับน้ำและคำนวณพิกัดเสา (Non-Time-Series)
"""

from .pole_coordinates import PoleCoordinateManager
from .scale_calibrator import PiecewiseScaleCalibrator
from .water_surface_detector import WaterSurfaceDetector
from .dashboard_builder import build_dashboard
try:
    from .excel_logger import WaterLevelExcelLogger, excel_logger
except ImportError:
    WaterLevelExcelLogger = None
    excel_logger = None

__all__ = [
    "PoleCoordinateManager",
    "PiecewiseScaleCalibrator",
    "WaterSurfaceDetector",
    "build_dashboard",
    "WaterLevelExcelLogger",
    "excel_logger"
]
