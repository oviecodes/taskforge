import redis
import json
from config import REDIS_HOST, REDIS_PORT, REDIS_PASSWORD
from utils.logger import log

logger = log("generate-pdf")

r = redis.Redis(host=REDIS_HOST, password=REDIS_PASSWORD, port=REDIS_PORT, socket_connect_timeout=15, socket_timeout=5, max_connections=5)
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


def isRedisHealthy():
    try:
        result = r.ping()
        return result == True or result == b"PONG" or result == "PONG"
    except Exception as e:
        logger.error(f"Redis health check failed: {e}")
        return False