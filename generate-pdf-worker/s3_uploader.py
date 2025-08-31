import boto3
import os
import logging
from botocore.exceptions import BotoCoreError, ClientError

logging.basicConfig(level=logging.INFO)

S3_BUCKET = os.getenv("S3_BUCKET_NAME")
REGION = os.getenv("AWS_REGION", "us-east-1")

S3_EXPIRE_SECONDS = 3600

s3 = boto3.client(
    "s3",
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    region_name=REGION
)

# def upload_to_s3(local_path, task_id):
#     key = f"pdfs/{task_id}.pdf"

#     s3.upload_file(
#         Filename=local_path,
#         Bucket=BUCKET,
#         Key=key,
#         ExtraArgs={
#             "ContentType": "application/pdf",
#             # "ACL": "public-read"  # or remove for private access
#         }
#     )

#     # return f"https://{BUCKET}.s3.{REGION}.amazonaws.com/{key}"
#     return getSignedUrl(BUCKET, key)

# def getSignedUrl(bucket, key): 
#     url = s3.generate_presigned_url(
#         ClientMethod='get_object',
#         Params={
#             'Bucket': bucket,
#             'Key': key
#         },
#         ExpiresIn=3600 # one hour in seconds, increase if needed
#     )

#     return url

def file_exists(bucket: str, key: str) -> bool:
    try:
        s3.head_object(Bucket=bucket, Key=key)
        return True
    except ClientError as e:
        if e.response['Error']['Code'] == "404":
            return False
        logging.error(f"⚠️ S3 head_object failed: {e}")
        return False

def generate_signed_url(s3_key: str) -> str:
    return s3.generate_presigned_url(
        ClientMethod='get_object',
        Params={"Bucket": S3_BUCKET, "Key": s3_key},
        ExpiresIn=S3_EXPIRE_SECONDS
    )
