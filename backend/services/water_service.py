from datetime import datetime, timedelta, timezone
from models.measurement import WaterMeasurement
from services.timeseries_inputs import station_codes, VERIFIED_WATER_SOURCE


class WaterService:
    @staticmethod
    def get_latest_measurement(db, station_code):
        ecosystem, _ = station_codes(station_code)
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        return db.query(WaterMeasurement).filter(
            WaterMeasurement.station_code == ecosystem,
            WaterMeasurement.source_type == VERIFIED_WATER_SOURCE,
            WaterMeasurement.timestamp <= now,
        ).order_by(WaterMeasurement.timestamp.desc(), WaterMeasurement.created_at.desc(), WaterMeasurement.id.desc()).first()

    @staticmethod
    def get_historical_measurements(db, station_code, hours=24):
        ecosystem, _ = station_codes(station_code)
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        records = db.query(WaterMeasurement).filter(
            WaterMeasurement.station_code == ecosystem,
            WaterMeasurement.source_type == VERIFIED_WATER_SOURCE,
            WaterMeasurement.timestamp >= now - timedelta(hours=hours), WaterMeasurement.timestamp <= now,
        ).order_by(WaterMeasurement.timestamp.asc(), WaterMeasurement.created_at.asc(), WaterMeasurement.id.asc()).all()
        latest_revision = {record.timestamp: record for record in records}
        return list(latest_revision.values())


water_service = WaterService()
