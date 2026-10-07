from minio import Minio
from minio.error import S3Error
from core.config import settings
import io

import socket

class MinIOService:
    def __init__(self):
        ep = settings.minio_endpoint
        try:
            host = ep.split(":")[0]
            socket.gethostbyname(host)
        except Exception:
            ep = "localhost:9000"
        self.endpoint = ep
        self.client = Minio(
            self.endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure
        )
        self._buckets_checked = False

    def init_buckets(self):
        import json
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

                # Ensure public read policy for images so Label Studio & frontend can load directly
                if b in [settings.bucket_raw_images, settings.bucket_processed_images]:
                    policy = {
                        "Version": "2012-10-17",
                        "Statement": [
                            {
                                "Effect": "Allow",
                                "Principal": {"AWS": ["*"]},
                                "Action": ["s3:GetBucketLocation", "s3:ListBucket"],
                                "Resource": [f"arn:aws:s3:::{b}"]
                            },
                            {
                                "Effect": "Allow",
                                "Principal": {"AWS": ["*"]},
                                "Action": ["s3:GetObject"],
                                "Resource": [f"arn:aws:s3:::{b}/*"]
                            }
                        ]
                    }
                    self.client.set_bucket_policy(b, json.dumps(policy))
            except Exception as e:
                print(f"[MinIO] Bucket check warning ({b}): {e}")

    def upload_image_bytes(self, bucket_name: str, object_name: str, data: bytes, content_type: str = "image/jpeg"):
        return self.upload_bytes(bucket_name, object_name, data, content_type)

    def upload_bytes(self, bucket_name: str, object_name: str, data: bytes, content_type: str = "application/octet-stream"):
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

    def get_object_bytes(self, bucket_name: str, object_name: str):
        try:
            resp = self.client.get_object(bucket_name, object_name)
            data = resp.read()
            resp.close()
            resp.release_conn()
            return data
        except Exception as e:
            print(f"[MinIO] Get object error ({bucket_name}/{object_name}): {e}")
            return None

minio_service = MinIOService()
