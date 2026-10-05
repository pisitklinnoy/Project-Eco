from datetime import datetime, timezone
from models.measurement import WaterMeasurement, RainfallMeasurement
from services.rid_source import fetch_rid_history
from services.hii_source import fetch_hii_history
from services.timeseries_inputs import VERIFIED_WATER_SOURCE, VERIFIED_RAIN_SOURCE, utc_naive
from hatyai_timeseries import ForecastInputError


class TelemetryService:
    @staticmethod
    def ingest_hii(db):
        rows, stations = fetch_hii_history()
        inserted = 0
        for row in rows:
            timestamp = utc_naive(row['time'])
            existing = db.query(RainfallMeasurement).filter(
                RainfallMeasurement.station_code == row['station_code'], RainfallMeasurement.timestamp == timestamp,
                RainfallMeasurement.source_type == VERIFIED_RAIN_SOURCE,
            ).order_by(RainfallMeasurement.created_at.desc(), RainfallMeasurement.id.desc()).first()
            if existing and existing.rain_amount_1h == row['rain_amount_1h'] and existing.rain_amount_24h == row['rain_amount_24h']:
                continue
            db.add(RainfallMeasurement(station_code=row['station_code'], timestamp=timestamp, source_type=VERIFIED_RAIN_SOURCE,
                rain_amount_1h=row['rain_amount_1h'], rain_amount_24h=row['rain_amount_24h'], source_url=row['source_url'],
                source_station_id=row['source_station_id'], source_sha256=row['source_sha256']))
            inserted += 1
        db.commit()
        return {"status": "ingested", "source": VERIFIED_RAIN_SOURCE, "inserted": inserted, "stations": stations,
                "retrieved_at": datetime.now(timezone.utc).isoformat()}

    def ingest_all(self, db):
        results = {}
        for name, operation in (("water", self.ingest_rid), ("rain", self.ingest_hii)):
            try:
                results[name] = operation(db)
            except ForecastInputError as exc:
                results[name] = {"status": "unavailable", "reason": str(exc)}
        return results

    @staticmethod
    def ingest_rid(db):
        rows = fetch_rid_history()
        inserted = 0
        for row in rows:
            timestamp = utc_naive(row["time"])
            existing = db.query(WaterMeasurement).filter(
                WaterMeasurement.station_code == row["station_code"],
                WaterMeasurement.timestamp == timestamp,
                WaterMeasurement.source_type == VERIFIED_WATER_SOURCE,
            ).order_by(WaterMeasurement.created_at.desc(), WaterMeasurement.id.desc()).first()
            if existing and existing.water_level == row["water_level"]:
                continue
            db.add(WaterMeasurement(station_code=row["station_code"], timestamp=timestamp,
                                    water_level=row["water_level"], source_type=VERIFIED_WATER_SOURCE))
            inserted += 1
        db.commit()
        return {"status": "ingested", "source": VERIFIED_WATER_SOURCE, "inserted": inserted,
                "retrieved_at": datetime.now(timezone.utc).isoformat(), "rain_available": False}


telemetry_service = TelemetryService()
