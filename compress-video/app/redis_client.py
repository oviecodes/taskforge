import redis
import os
import json

from app.utils.logger import log

from dotenv import load_dotenv
load_dotenv()

logger = log("compress-video")

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
TASK_TTL_SECONDS = int(os.getenv("REDIS_TASK_TTL", 300))  # 5 minutes

rdb = redis.Redis.from_url(REDIS_URL)

def publish_result(task_id: str, result: dict):
    """
    Save task result in Redis and publish update
    Key: task:<taskId>:status (HASH)
    Pub/Sub: task:<taskId>:status
    """
    key = f"task:{task_id}:status"
    payload = json.dumps(result)

    with logger.contextualize(taskId=task_id):

        try:
            # Set hash (optional: use hset if result is complex)
            # rdb.set(key, payload)
            # rdb.expire(key, TASK_TTL_SECONDS)

            # Publish to WebSocket listener(s)
            rdb.publish(key, payload)

            logger.info(f"📡 Redis result published for task {task_id}")
        except Exception as e:
            logger.error(f"❌ Redis publish failed: {e}")

def cache_task_output(task_type: str, task_id: str, result: dict):
    with logger.contextualize(taskId=task_id):
        key = f"task:{task_type}:{task_id}:output"
        rdb.setex(key, TASK_TTL_SECONDS, json.dumps(result))
        logger.info(f"💾 Cached output for {key}")

def get_cached_output(task_type: str, task_id: str):
    with logger.contextualize(taskId=task_id):
        key = f"task:{task_type}:{task_id}:output"
        result = rdb.get(key)
        if result:
            logger.info(f"♻️ Found cached output for {key}")
            return json.loads(result)
        return None