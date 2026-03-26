import io
import json
import uuid
from typing import BinaryIO

import boto3
from botocore.exceptions import ClientError
from PIL import Image

from app.config import settings

ALLOWED_TYPES = {'image/jpeg', 'image/png', 'image/webp', 'image/gif'}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
THUMBNAIL_MAX_WIDTH = 1200


class MediaService:
    """S3-compatible media storage (MinIO in dev, R2/S3 in prod)."""

    def __init__(self):
        self.client = boto3.client(
            's3',
            endpoint_url=settings.s3_endpoint,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name='us-east-1',
        )

    def create_buckets(self):
        """Create required buckets if they don't exist."""
        for bucket in [settings.s3_bucket_posts, settings.s3_bucket_chat]:
            try:
                self.client.head_bucket(Bucket=bucket)
            except ClientError:
                self.client.create_bucket(Bucket=bucket)
                # Set public-read policy so images are accessible via URL
                policy = {
                    'Version': '2012-10-17',
                    'Statement': [{
                        'Sid': 'PublicRead',
                        'Effect': 'Allow',
                        'Principal': '*',
                        'Action': ['s3:GetObject'],
                        'Resource': [f'arn:aws:s3:::{bucket}/*'],
                    }],
                }
                self.client.put_bucket_policy(
                    Bucket=bucket,
                    Policy=json.dumps(policy),
                )

    def upload(
        self,
        file_data: BinaryIO,
        content_type: str,
        purpose: str,
    ) -> dict:
        """Upload a file and return URLs. Returns {url, thumbnail_url, media_type}."""
        ext = content_type.split('/')[-1]
        if ext == 'jpeg':
            ext = 'jpg'
        file_id = uuid.uuid4().hex
        filename = f'{file_id}.{ext}'

        bucket = (
            settings.s3_bucket_posts if purpose == 'post'
            else settings.s3_bucket_chat
        )

        raw_bytes = file_data.read()

        # Generate thumbnail for non-GIF images
        thumbnail_url = None
        if content_type != 'image/gif':
            thumb_bytes, thumb_ext = self._make_thumbnail(raw_bytes, content_type)
            if thumb_bytes:
                thumb_name = f'thumb/{file_id}.{thumb_ext}'
                self.client.put_object(
                    Bucket=bucket,
                    Key=thumb_name,
                    Body=thumb_bytes,
                    ContentType=f'image/{thumb_ext}',
                )
                thumbnail_url = f'{settings.s3_public_url}/{bucket}/{thumb_name}'

        self.client.put_object(
            Bucket=bucket,
            Key=filename,
            Body=raw_bytes,
            ContentType=content_type,
        )

        url = f'{settings.s3_public_url}/{bucket}/{filename}'
        return {
            'url': url,
            'thumbnail_url': thumbnail_url or url,
            'media_type': 'image',
        }

    def _make_thumbnail(
        self, raw_bytes: bytes, content_type: str
    ) -> tuple[bytes | None, str]:
        """Resize image to max width, return (bytes, extension) or (None, '')."""
        try:
            img = Image.open(io.BytesIO(raw_bytes))
            if img.width <= THUMBNAIL_MAX_WIDTH:
                return None, ''
            ratio = THUMBNAIL_MAX_WIDTH / img.width
            new_size = (THUMBNAIL_MAX_WIDTH, int(img.height * ratio))
            img = img.resize(new_size, Image.LANCZOS)

            buf = io.BytesIO()
            out_format = 'WEBP'
            img.save(buf, format=out_format, quality=80)
            return buf.getvalue(), 'webp'
        except Exception:
            return None, ''


media_service = MediaService()
