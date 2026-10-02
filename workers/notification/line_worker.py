import os
import requests
from datetime import datetime

LINE_TOKEN = os.getenv("LINE_CHANNEL_ACCESS_TOKEN", "")
LINE_TARGET_ID = os.getenv("LINE_TARGET_USER_OR_GROUP_ID", "")

async def send_async_line_notification(ctx, payload: dict):
    """
    Task handler สำหรับส่งข้อความแจ้งเตือนภัยผ่าน LINE Messaging API
    """
    station_code = payload.get("station_code", "STN-HY01")
    severity = payload.get("severity", "WARNING")
    water_level = payload.get("water_level", 0.0)
    msg = payload.get("message", "ตรวจพบระดับน้ำสูงผิดปกติ")

    print(f"\n[Notification Worker] 📲 Dispatching LINE Alert for {station_code}: {severity} ({water_level}m)")

    if not LINE_TOKEN or not LINE_TARGET_ID:
        print("[Notification Worker] ⚠️ LINE Token / Target ID not provided. Logged simulated notification.")
        return {"status": "simulated", "delivered": False}

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {LINE_TOKEN}"
    }
    body = {
        "to": LINE_TARGET_ID,
        "messages": [
            {
                "type": "text",
                "text": f"🚨 [Hatyai FloodLens Alert]\nสถานี: {station_code}\nระดับ: {severity}\nระดับน้ำ: {water_level:.2f} ม.\n{msg}"
            }
        ]
    }

    try:
        res = requests.post("https://api.line.me/v2/bot/message/push", headers=headers, json=body, timeout=5)
        print(f"[Notification Worker] LINE Response Status: {res.status_code}")
        return {"status": "sent", "code": res.status_code}
    except Exception as e:
        print(f"[Notification Worker] LINE delivery failed (non-fatal): {e}")
        return {"status": "failed", "error": str(e)}
