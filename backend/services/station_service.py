from sqlalchemy.orm import Session
from models.station import Station
from schemas.station import StationCreate

class StationService:
    @staticmethod
    def get_all_stations(db: Session):
        stations = db.query(Station).filter(Station.is_active == True).all()
        if not stations:
            # Seed initial Hat Yai monitoring pilot stations
            stations = StationService.seed_initial_stations(db)
        return stations

    @staticmethod
    def get_station_by_code(db: Session, station_code: str):
        return db.query(Station).filter(Station.station_code == station_code).first()

    @staticmethod
    def seed_initial_stations(db: Session):
        initial = [
            Station(
                station_code="STN-HY01",
                name="จุดเฝ้าระวังสะพานท่าเคียน (คลองอู่ตะเภา)",
                location_name="สะพานท่าเคียน อ.หาดใหญ่",
                latitude=7.0095,
                longitude=100.4578,
                normal_level=2.2,
                warning_level=3.5,
                critical_level=4.2,
                bank_level=5.0,
                camera_id="CAM-HY01",
                camera_stream_url="http://mock-cctv.hatyai/cam01.jpg"
            ),
            Station(
                station_code="STN-HY02",
                name="จุดเฝ้าระวังสถานีจันทร์วิโรจน์ (คลองเตย)",
                location_name="ชุมชนจันทร์วิโรจน์ อ.หาดใหญ่",
                latitude=7.0031,
                longitude=100.4722,
                normal_level=1.8,
                warning_level=3.0,
                critical_level=3.8,
                bank_level=4.5,
                camera_id="CAM-HY02",
                camera_stream_url="http://mock-cctv.hatyai/cam02.jpg"
            ),
            Station(
                station_code="STN-HY03",
                name="จุดเฝ้าระวังสะพานเสนาณรงค์",
                location_name="ค่ายเสนาณรงค์ อ.หาดใหญ่",
                latitude=6.9850,
                longitude=100.4850,
                normal_level=2.0,
                warning_level=3.2,
                critical_level=4.0,
                bank_level=4.8,
                camera_id="CAM-HY03",
                camera_stream_url="http://mock-cctv.hatyai/cam03.jpg"
            )
        ]
        db.add_all(initial)
        db.commit()
        return initial

station_service = StationService()
