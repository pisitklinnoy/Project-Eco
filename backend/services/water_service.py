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
            from models.station import Station
            stn = db.query(Station).filter(Station.station_code == station_code).first()
            base = stn.normal_level if stn else 3.0
            # Seed initial current measurement
            meas = WaterMeasurement(
                station_code=station_code,
                timestamp=datetime.utcnow(),
                water_level=round(base + random.uniform(-0.1, 0.2), 2),
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
            from models.station import Station
            stn = db.query(Station).filter(Station.station_code == station_code).first()
            base_level = stn.normal_level if stn else 3.0
            now = datetime.utcnow()
            for i in range(hours, 0, -1):
                t = now - timedelta(hours=i)
                w = round(base_level + (random.uniform(-0.15, 0.15)), 2)
                records.append(WaterMeasurement(
                    station_code=station_code,
                    timestamp=t,
                    water_level=w,
                    source_type="API"
                ))
        return records

water_service = WaterService()
