import io
import urllib.request
from PIL import Image, ImageDraw
from datetime import datetime

CAMERA_URL_MAP = {
    "CAM-BANGSALA": "https://hatyaicityclimate.org/floodphoto/last/bangsala.jpg",
    "STN-BANGSALA": "https://hatyaicityclimate.org/floodphoto/last/bangsala.jpg",
    "CAM-MUANGKONG": "https://hatyaicityclimate.org/floodphoto/last/muangkong.jpg",
    "STN-MUANGKONG": "https://hatyaicityclimate.org/floodphoto/last/muangkong.jpg",
    "CAM-HATYAINAI": "http://live:Live2025!@ta200304.dyndns.info:5001/axis-cgi/mjpg/video.cgi",
    "STN-HATYAINAI": "http://live:Live2025!@ta200304.dyndns.info:5001/axis-cgi/mjpg/video.cgi",
}

class CameraFetcher:
    @staticmethod
    def capture_frame(camera_id: str = "CAM-BANGSALA") -> bytes:
        """
        ดึงภาพเฟรมกล้อง CCTV จริง (รวม Axis ta200304 และ hatyaicityclimate.org)
        หากมีปัญหาในการดาวน์โหลด จะ Fallback ไปยังแหล่งภาพสำรองอัตโนมัติ
        """
        import base64
        import socket
        url = CAMERA_URL_MAP.get(camera_id)

        # จัดการกรณีกล้อง Axis (ta200304)
        if url and "ta200304" in url:
            try:
                host = "ta200304.dyndns.info"
                port = 5001
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(1.5)
                res = sock.connect_ex((host, port))
                sock.close()
                if res == 0:
                    snapshot_url = "http://ta200304.dyndns.info:5001/axis-cgi/jpg/image.cgi"
                    req = urllib.request.Request(snapshot_url)
                    creds = ('%s:%s' % ('live', 'Live2025!')).encode('ascii')
                    req.add_header('Authorization', 'Basic %s' % base64.b64encode(creds).decode('ascii'))
                    req.add_header('User-Agent', 'Mozilla/5.0 HatyaiFloodLens/1.0')
                    with urllib.request.urlopen(req, timeout=4.0) as resp:
                        if resp.status == 200:
                            img_bytes = resp.read()
                            print(f"[CameraFetcher] ✅ Successfully fetched live Axis frame ({len(img_bytes)} bytes) for {camera_id}")
                            return img_bytes
            except Exception as e:
                print(f"[CameraFetcher] ⚠️ Axis camera unreachable ({e}), falling back to hatyaicityclimate.")
            url = "https://hatyaicityclimate.org/floodphoto/last/hatyainai.jpg"

        if url:
            try:
                print(f"[CameraFetcher] 🌐 Fetching live CCTV snapshot from: {url}")
                req = urllib.request.Request(
                    url,
                    headers={
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) HatyaiFloodLens/1.0"
                    }
                )
                with urllib.request.urlopen(req, timeout=12) as resp:
                    if resp.status == 200:
                        img_bytes = resp.read()
                        print(f"[CameraFetcher] ✅ Successfully fetched live frame ({len(img_bytes)} bytes) for {camera_id}")
                        return img_bytes
            except Exception as e:
                print(f"[CameraFetcher] ⚠️ Warning: Failed to fetch live snapshot from {url}: {e}. Using fallback generator.")

        # Fallback สร้างภาพสังเคราะห์ 640x480 หากเครือข่ายขัดข้อง
        img = Image.new("RGB", (640, 480), color=(70, 130, 180))
        draw = ImageDraw.Draw(img)
        draw.rectangle([0, 0, 640, 150], fill=(139, 119, 101))
        draw.rectangle([0, 380, 640, 480], fill=(85, 107, 47))
        draw.rectangle([300, 100, 340, 420], fill=(245, 245, 245), outline=(0, 0, 0))
        for y in range(120, 420, 30):
            draw.line([300, y, 320, y], fill=(255, 0, 0), width=2)
            
        timestamp_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        draw.text((20, 20), f"Hatyai CCTV Fallback: {camera_id} | {timestamp_str}", fill=(255, 255, 255))
        
        output = io.BytesIO()
        img.save(output, format="JPEG")
        return output.getvalue()

camera_fetcher = CameraFetcher()
