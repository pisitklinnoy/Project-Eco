from sqlalchemy.orm import Session
from models.measurement import WaterMeasurement, RainfallMeasurement
from datetime import datetime, timedelta
from schemas.review import ReviewPackageResponse, ReviewImageContext

class ReviewService:
    @staticmethod
    def compile_review_package(db: Session, station_code: str, measurement_id: int):
        current_meas = db.query(WaterMeasurement).filter(WaterMeasurement.id == measurement_id).first()
        one_hour_ago = datetime.utcnow() - timedelta(hours=1)
        
        hist_meas = db.query(WaterMeasurement).filter(
            WaterMeasurement.station_code == station_code,
            WaterMeasurement.timestamp >= one_hour_ago
        ).order_by(WaterMeasurement.timestamp.desc()).all()

        hist_items = []
        for m in hist_meas:
            hist_items.append(ReviewImageContext(
                snapshot_time=m.timestamp,
                image_url=m.image_minio_path or "/static/mock_camera.jpg",
                ai_detected_level=m.water_level,
                ai_confidence=m.vision_confidence,
                rain_amount_1h=5.2,
                api_water_level=m.water_level
            ))

        return ReviewPackageResponse(
            package_id=f"REV-{station_code}-{measurement_id}",
            station_code=station_code,
            current_image_url=current_meas.image_minio_path if current_meas else "/static/mock_camera.jpg",
            historical_images=hist_items,
            reason_flagged="LOW_CONFIDENCE_AMBIGUOUS_WATERLINE",
            created_at=datetime.utcnow()
        )

    @staticmethod
    def apply_human_review(db: Session, measurement_id: int, corrected_level: float, reviewer_notes: str = None):
        meas = db.query(WaterMeasurement).filter(WaterMeasurement.id == measurement_id).first()
        if meas:
            meas.water_level = corrected_level
            meas.is_reviewed_by_human = True
            meas.source_type = "MANUAL_REVIEW"
            db.commit()
            db.refresh(meas)
        return meas

review_service = ReviewService()
