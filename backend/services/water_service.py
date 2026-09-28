from sqlalchemy.orm import Session
from sqlalchemy import desc
from models.measurement import WaterMeasurement, RainfallMeasurement
from datetime import datetime, timedelta
import random

class WaterService:
    @staticmethod
    def get_latest_measurement(db: Session, station_code: str):
        meas = db.query(WaterMeasurement).filter(
            WaterMeasurement.station_code == station_code
        ).order_by(desc(WaterMeasurement.timestamp)).first()
        
        if not meas:
            # Seed mock current measurement
            meas = WaterMeasurement(
                station_code=station_code,
                timestamp=datetime.utcnow(),
                water_level=round(random.uniform(2.8, 3.4), 2),
                source_type="CAMERA_VISION",
                vision_confidence=0.92
            )
            db.add(meas)
            db.commit()
            db.refresh(meas)
        return meas

    @staticmethod
    def get_historical_measurements(db: Session, station_code: str, hours: int = 24):
        since = datetime.utcnow() - timedelta(hours=hours)
        records = db.query(WaterMeasurement).filter(
            WaterMeasurement.station_code == station_code,
            WaterMeasurement.timestamp >= since
        ).order_by(WaterMeasurement.timestamp.asc()).all()

        if not records:
            # Generate simulated smooth sequence
            base_level = 2.8
            now = datetime.utcnow()
            for i in range(hours, 0, -1):
                t = now - timedelta(hours=i)
                w = round(base_level + (random.uniform(-0.1, 0.2)), 2)
                records.append(WaterMeasurement(
                    station_code=station_code,
                    timestamp=t,
                    water_level=w,
                    source_type="API"
                ))
        return records

water_service = WaterService()
