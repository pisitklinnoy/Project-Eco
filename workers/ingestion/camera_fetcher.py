import io
from PIL import Image, ImageDraw, ImageFont
from datetime import datetime

class CameraFetcher:
    @staticmethod
    def capture_frame(camera_id: str = "CAM-HY01") -> bytes:
        """
        จำลองการจับภาพเฟรมกล้อง CCTV หาดใหญ่ (สร้างภาพจำลองคลองและมาตรวัดน้ำ)
        เมื่อต่อกับกล้องจริง สามารถใส่โค้ด cv2.VideoCapture หรือ requests.get(snapshot_url)
        """
        # สร้างภาพสังเคราะห์ 640x480 สำหรับทดสอบระบบท่อส่งข้อมูล
        img = Image.new("RGB", (640, 480), color=(70, 130, 180)) # สีน้ำเงินคลอง
        draw = ImageDraw.Draw(img)
        
        # วาดตลิ่งและสะพาน
        draw.rectangle([0, 0, 640, 150], fill=(139, 119, 101))
        draw.rectangle([0, 380, 640, 480], fill=(85, 107, 47))
        
        # วาดเสาวัดระดับน้ำ (Water Staff Gauge)
        draw.rectangle([300, 100, 340, 420], fill=(245, 245, 245), outline=(0, 0, 0))
        for y in range(120, 420, 30):
            draw.line([300, y, 320, y], fill=(255, 0, 0), width=2)
            
        timestamp_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        draw.text((20, 20), f"Hatyai CCTV: {camera_id} | {timestamp_str}", fill=(255, 255, 255))
        
        output = io.BytesIO()
        img.save(output, format="JPEG")
        return output.getvalue()

camera_fetcher = CameraFetcher()
