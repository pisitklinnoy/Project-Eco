import requests
from sqlalchemy.orm import Session
from models.alert import AlertEvent
from core.config import settings
from datetime import datetime

class NotificationService:
    @staticmethod
    def send_line_alert(db: Session, station_code: str, severity: str, water_level: float, message_text: str):
        alert = AlertEvent(
            station_code=station_code,
            severity_level=severity,
            trigger_water_level=water_level,
            message=message_text,
            is_sent_line=False
        )
        db.add(alert)
        db.commit()
        db.refresh(alert)

        # Dispatch via LINE Messaging API if configured
        if settings.line_channel_access_token and settings.line_target_user_or_group_id:
            try:
                headers = {
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {settings.line_channel_access_token}"
                }
                payload = {
                    "to": settings.line_target_user_or_group_id,
                    "messages": [
                        {
                            "type": "text",
                            "text": f"🚨 [แจ้งเตือนระดับน้ำหาดใหญ่ - FloodLens]\nสถานี: {station_code}\nระดับความรุนแรง: {severity}\nระดับน้ำปัจจุบัน: {water_level:.2f} ม.\nข้อความ: {message_text}\nเวลา: {datetime.now().strftime('%H:%M:%S')}"
                        }
                    ]
                }
                res = requests.post("https://api.line.me/v2/bot/message/push", headers=headers, json=payload, timeout=10)
                print(f"[NotificationService] LINE Push Response: {res.status_code} - {res.text}")
                alert.is_sent_line = (res.status_code == 200)
                alert.line_response_code = res.status_code
                alert.sent_at = datetime.utcnow()
                db.commit()
            except Exception as e:
                print(f"[NotificationService] LINE send error (non-blocking): {e}")
        else:
            print(f"[NotificationService] Simulation: LINE Alert recorded for {station_code}: {severity} ({water_level}m)")

        return alert

notification_service = NotificationService()
