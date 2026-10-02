from sqlalchemy.orm import Session
from models.station import Station
from schemas.station import StationCreate

class StationService:
    @staticmethod
    def get_all_stations(db: Session):
        stations = db.query(Station).filter(Station.is_active == True).all()
        # Check if real stations already exist
        has_real_stations = any(s.station_code in ["STN-BANGSALA", "STN-MUANGKONG", "STN-HATYAINAI"] for s in stations)
        hatyai_stn = next((s for s in stations if s.station_code == "STN-HATYAINAI"), None)
        if not stations or not has_real_stations or (hatyai_stn and "ta200304" not in (hatyai_stn.camera_stream_url or "")):
            stations = StationService.seed_initial_stations(db)
        return stations

    @staticmethod
    def get_station_by_code(db: Session, station_code: str):
        return db.query(Station).filter(Station.station_code == station_code).first()

    @staticmethod
    def seed_initial_stations(db: Session):
        # Deactivate old mock stations if any
        db.query(Station).filter(Station.station_code.in_(["STN-HY01", "STN-HY02", "STN-HY03"])).update({"is_active": False}, synchronize_session=False)

        real_stations = [
            Station(
                station_code="STN-BANGSALA",
                name="สะพานบางศาลา (คลองอู่ตะเภา X.90)",
                location_name="ต.บางศาลา อ.คลองหอยโข่ง จ.สงขลา (จุดตรวจมวลน้ำต้นน้ำ)",
                latitude=6.931207,
                longitude=100.439536,
                normal_level=2.75,
                warning_level=8.0,
                critical_level=9.34,
                bank_level=12.0,
                camera_id="CAM-BANGSALA",
                camera_stream_url="https://hatyaicityclimate.org/floodphoto/last/bangsala.jpg",
                is_active=True
            ),
            Station(
                station_code="STN-MUANGKONG",
                name="สะพานบ้านม่วงก็อง (คลองอู่ตะเภา X.173A)",
                location_name="ต.พังลา อ.สะเดา จ.สงขลา (จุดตัดน้ำสะเดา)",
                latitude=6.823193,
                longitude=100.438272,
                normal_level=10.2,
                warning_level=16.0,
                critical_level=16.4,
                bank_level=18.0,
                camera_id="CAM-MUANGKONG",
                camera_stream_url="https://hatyaicityclimate.org/floodphoto/last/muangkong.jpg",
                is_active=True
            ),
            Station(
                station_code="STN-HATYAINAI",
                name="สะพานหาดใหญ่นอก / ที่ว่าการ อ.หาดใหญ่ (X.44)",
                location_name="ข้างที่ว่าการอำเภอหาดใหญ่ อ.หาดใหญ่ จ.สงขลา",
                latitude=7.002231,
                longitude=100.455775,
                normal_level=0.60,
                warning_level=5.5,
                critical_level=6.0,
                bank_level=9.0,
                camera_id="CAM-HATYAINAI",
                camera_stream_url="http://live:Live2025!@ta200304.dyndns.info:5001/axis-cgi/mjpg/video.cgi",
                is_active=True
            )
        ]

        for stn in real_stations:
            existing = db.query(Station).filter(Station.station_code == stn.station_code).first()
            if not existing:
                db.add(stn)
            else:
                existing.name = stn.name
                existing.location_name = stn.location_name
                existing.latitude = stn.latitude
                existing.longitude = stn.longitude
                existing.normal_level = stn.normal_level
                existing.warning_level = stn.warning_level
                existing.critical_level = stn.critical_level
                existing.bank_level = stn.bank_level
                existing.camera_id = stn.camera_id
                existing.camera_stream_url = stn.camera_stream_url
                existing.is_active = True

        db.commit()
        return db.query(Station).filter(Station.is_active == True).all()

station_service = StationService()
