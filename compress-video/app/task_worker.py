import os
import tempfile
import traceback
from app.utils.logger import log

from app.ffmpeg_compressor import compress_video
from app.s3_uploader import upload_to_s3, generate_signed_url, file_exists
from app.redis_client import publish_result, get_cached_output, cache_task_output
from app.utils.safe_delete import safe_delete


logger = log(service="compress-video")

def handle_task(task: dict):
    task_id = task.get("id")
    payload = task.get("payload", {})
    print("payload", payload)
    trace_id = task.get("traceId")
    task_type = "compress-video"

    video_url = payload.get("videoUrl")
    format = payload.get("format", "mp4")

    s3_key = f"compressed-videos/{task_id}.{format}"

    if not video_url:
        raise ValueError("Missing 'videoUrl' in task payload")
        
    
    cached = get_cached_output(task_type, task_id)
    if cached:
        publish_result(task_id, { **cached, "cached": True })
        return
    
    if file_exists(os.getenv("S3_BUCKET_NAME"), s3_key):
        logger.info(f"♻️ Skipping task {task_id} — file already in S3")
        signed_url = generate_signed_url(s3_key)
        result = {
            "success": True,
            "url": signed_url,
            "cached": True
        }
        publish_result(task_id, result)
        cache_task_output(task_type, task_id, result)
        return
    
    with logger.contextualize(taskId=task_id, traceId=trace_id):
        logger.info(f"🎞️ Starting compression for task {task_id}")

        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                input_path = os.path.join(tmpdir, "input.mp4")
                output_path = os.path.join(tmpdir, f"output.{format}")

                # Download video
                logger.info(f"⬇️ Downloading video from {video_url}")
                publish_result(task_id, {"status": "processing", "progress": 10, "message": f"⬇️ Downloading video from {video_url}"})
                _download_file(video_url, input_path)

                options = {
                    "format": format,                       
                    "bitrate": payload.get("bitrate"),     
                    "preset": payload.get("preset")       
                }

                # Compress
                logger.info(f"⚙️ Compressing to {format}")
                publish_result(task_id, {"status": "processing", "progress": 30, "message": f"⚙️ Compressing to {format}"})
                compress_video(input_path, output_path, options)

                # Upload to S3
                logger.info(f"☁️ Uploading to S3")
                publish_result(task_id, {"status": "processing", "progress": 80, "message": f"☁️ Uploading to S3"})
                s3_url = upload_to_s3(output_path, f"compressed-videos/{task_id}.{format}")

                # Publish Redis result
                result = {
                    "progress": 100,
                    "success": True,
                    "url": s3_url
                }
                publish_result(task_id, result)
                cache_task_output(task_type, task_id, result)
                logger.info(f"✅ Task {task_id} complete: {s3_url}")

        except Exception as e:
            logger.error(f"Task {task_id} failed: {e}")
            logger.debug(traceback.format_exc())

            result = {
                "success": False,
                "error": str(e)
            }
            publish_result(task_id, result)
            raise e
        
        finally: 
            # Cleanup temp file no matter what
            safe_delete(output_path)


def _download_file(url: str, dest_path: str):
    import requests
    response = requests.get(url, stream=True, timeout=60)
    response.raise_for_status()

    with open(dest_path, "wb") as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)
