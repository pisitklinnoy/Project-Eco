from datetime import datetime, timezone
from models.measurement import WaterMeasurement
from services.rid_source import fetch_rid_history
from services.timeseries_inputs import VERIFIED_WATER_SOURCE, utc_naive


class TelemetryService:
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
