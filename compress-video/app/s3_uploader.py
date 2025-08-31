import boto3
import os
from app.utils.logger import log
from app.utils.metrics import s3_upload_failures_total

from botocore.exceptions import BotoCoreError, ClientError

logger = log("compress-video")

AWS_REGION = os.getenv("AWS_REGION")
S3_BUCKET = os.getenv("S3_BUCKET_NAME")
S3_EXPIRE_SECONDS = int(os.getenv("S3_SIGNED_URL_EXP", 600))  # 10 min default

s3 = boto3.client(
    "s3",
    region_name=AWS_REGION,
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY")
)

def upload_to_s3(file_path: str, s3_key: str) -> str:
    """
    Uploads a file to S3 and returns a signed URL
    """
    try:
        logger.info(f"🚀 Uploading to S3 → {S3_BUCKET}/{s3_key}")
        s3.upload_file(
            Filename=file_path,
            Bucket=S3_BUCKET,
            Key=s3_key,
            ExtraArgs={"ContentType": "video/mp4"}
        )

        signed_url = s3.generate_presigned_url(
            ClientMethod='get_object',
            Params={"Bucket": S3_BUCKET, "Key": s3_key},
            ExpiresIn=S3_EXPIRE_SECONDS
        )

        logger.info(f"🔑 Signed S3 URL generated (expires in {S3_EXPIRE_SECONDS}s)")
        return signed_url

    except (BotoCoreError, ClientError) as e:
        s3_upload_failures_total.labels(type="compress-video").inc()
        logger.error(f"❌ S3 upload failed: {e}")
        raise RuntimeError("Upload to S3 failed") from e

def file_exists(bucket: str, key: str) -> bool:
    try:
        s3.head_object(Bucket=bucket, Key=key)
        return True
    except ClientError as e:
        if e.response['Error']['Code'] == "404":
            return False
        logger.error(f"⚠️ S3 head_object failed: {e}")
        return False

def generate_signed_url(s3_key: str) -> str:
    return s3.generate_presigned_url(
        ClientMethod='get_object',
        Params={"Bucket": S3_BUCKET, "Key": s3_key},
        ExpiresIn=S3_EXPIRE_SECONDS
    )