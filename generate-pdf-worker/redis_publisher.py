import redis
import json
from config import REDIS_URL
from utils.logger import log

logger = log("generate-pdf")


print("redis-url", REDIS_URL)

r = redis.Redis.from_url(REDIS_URL)
TASK_TTL_SECONDS = 300


def publish_status(task_id, status, progress, message, fileUrl=None):
    payload = {
        "status": status,
        "progress": progress,
        "message": message,
        "fileUrl": fileUrl
    }
    channel = f"task:{task_id}:status"
    r.publish(channel, json.dumps(payload))

def cache_task_output(task_type: str, task_id: str, result: dict):
    key = f"task:{task_type}:{task_id}:output"
    r.setex(key, TASK_TTL_SECONDS, json.dumps(result))
    logger.info(f"💾 Cached output for {key}")

def get_cached_output(task_type: str, task_id: str):
    key = f"task:{task_type}:{task_id}:output"
    result = r.get(key)
    if result:
        logger.info(f"♻️ Found cached output for {key}")
        return json.loads(result)
    return None