from minio import Minio
from minio.error import S3Error
from core.config import settings
import io

class MinIOService:
    def __init__(self):
        self.client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure
        )
        self._buckets_checked = False

    def init_buckets(self):
        buckets = [
            settings.bucket_raw_images,
            settings.bucket_processed_images,
            settings.bucket_models
        ]
        for b in buckets:
            try:
                if not self.client.bucket_exists(b):
                    self.client.make_bucket(b)
                    print(f"[MinIO] Created bucket: {b}")
            except Exception as e:
                print(f"[MinIO] Bucket check warning ({b}): {e}")

    def upload_image_bytes(self, bucket_name: str, object_name: str, data: bytes, content_type: str = "image/jpeg"):
        try:
            self.client.put_object(
                bucket_name=bucket_name,
                object_name=object_name,
                data=io.BytesIO(data),
                length=len(data),
                content_type=content_type
            )
            return f"{bucket_name}/{object_name}"
        except S3Error as e:
            print(f"[MinIO] Upload error: {e}")
            return None

    def get_presigned_url(self, bucket_name: str, object_name: str, expires_hours: int = 1) -> str:
        try:
            from datetime import timedelta
            return self.client.presigned_get_object(bucket_name, object_name, expires=timedelta(hours=expires_hours))
        except Exception as e:
            return f"http://{settings.minio_endpoint}/{bucket_name}/{object_name}"

minio_service = MinIOService()
