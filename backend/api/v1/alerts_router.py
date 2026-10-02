from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List
from core.database import get_db
from models.alert import AlertEvent
from schemas.alert import AlertResponse
from services.notification_service import notification_service

router = APIRouter(prefix="/alerts", tags=["Emergency Alerts & LINE Notifications"])

@router.get("/recent", response_model=List[AlertResponse])
def get_recent_alerts(limit: int = 10, db: Session = Depends(get_db)):
    """ประวัติการแจ้งเตือนภัยน้ำท่วมล่าสุด"""
    return db.query(AlertEvent).order_by(desc(AlertEvent.timestamp)).limit(limit).all()

@router.post("/test-trigger", response_model=AlertResponse)
def test_trigger_alert(
    station_code: str = "STN-BANGSALA",
    level: float = 8.5,
    severity: str = "CRITICAL",
    db: Session = Depends(get_db)
):
    """ทดสอบยิง Alert และส่งข้อความ LINE แจ้งเตือน"""
    return notification_service.send_line_alert(
        db,
        station_code=station_code,
        severity=severity,
        water_level=level,
        message_text=f"ระดับน้ำขึ้นสูงแตะระดับวิกฤต {level:.2f} ม. บริเวณ {station_code}"
    )
