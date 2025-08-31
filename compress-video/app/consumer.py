import pika
import json
import os
import time
from app.utils.logger import log
import threading
from app.utils.metrics import task_dropped_total, task_processed_total, task_processing_duration_seconds, task_retry_attempts_total

from app import task_worker
from dotenv import load_dotenv

load_dotenv()
logger = log("compress-video")

# ENV
RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672")
QUEUE_NAME = os.getenv("QUEUE_NAME")
EXCHANGE_NAME = os.getenv("EXCHANGE_NAME")
ROUTING_KEY = os.getenv("ROUTING_KEY")

# TTL-Based DLX Configuration (following gold standard)
MAX_RETRIES = 3
RETRY_DELAY_MS = 30000  # 30 seconds (following resize-image pattern)

MAX_RABBITMQ_RETRIES = 10
RETRY_DELAY_SECONDS = 5

# TTL-Based DLX Pattern: Extract retry count from RabbitMQ's x-death headers
def get_retry_count(properties):
    """Extract retry count from RabbitMQ's x-death headers (automatic DLX tracking)"""
    if not properties or not properties.headers:
        return 0
    
    x_death = properties.headers.get("x-death", [])
    if x_death and len(x_death) > 0:
        death = x_death[0]
        if isinstance(death, dict):
            return death.get("count", 0)
    return 0

def heartbeat_thread(connection):
    while True:
        time.sleep(10)
        try:
            connection.process_data_events()
        except Exception as e:
            logger.error(f"❌ Heartbeat failed: {e}")
            break

def start_consumer():
    retry_exchange = f"{EXCHANGE_NAME}.retry"
    retry_queue = f"{QUEUE_NAME}.retry"
    retry_routing_key = f"{ROUTING_KEY}.retry"
    final_dlq = f"{QUEUE_NAME}.dead"

    # Connect with retry logic
    connection = None
    for attempt in range(1, MAX_RABBITMQ_RETRIES + 1):
        try:
            logger.info(f"📡 Connecting to RabbitMQ (Attempt {attempt}/{MAX_RABBITMQ_RETRIES})...")
            params = pika.URLParameters(RABBITMQ_URL)
            params.heartbeat = 30
            params.blocked_connection_timeout = 60
            connection = pika.BlockingConnection(params)
            channel = connection.channel()
            break
        except Exception as e:
            logger.error(f"❌ RabbitMQ connection failed: {e}")
            if attempt < MAX_RABBITMQ_RETRIES:
                time.sleep(RETRY_DELAY_SECONDS)
            else:
                logger.critical("💥 Max RabbitMQ retries reached. Exiting.")
                raise SystemExit(1)

    # Declare exchanges
    channel.exchange_declare(exchange=EXCHANGE_NAME, exchange_type="direct", durable=True)
    channel.exchange_declare(exchange=retry_exchange, exchange_type="direct", durable=True)

    # TTL-Based DLX Pattern: Retry queue routes back to main queue after TTL
    channel.queue_declare(
        queue=retry_queue,
        durable=True,
        arguments={
            "x-message-ttl": RETRY_DELAY_MS,
            "x-dead-letter-exchange": EXCHANGE_NAME,
            "x-dead-letter-routing-key": ROUTING_KEY
        }
    )
    channel.queue_bind(queue=retry_queue, exchange=retry_exchange, routing_key=retry_routing_key)

    # TTL-Based DLX Pattern: Main queue routes to retry exchange on failure
    channel.queue_declare(
        queue=QUEUE_NAME,
        durable=True,
        arguments={
            "x-dead-letter-exchange": retry_exchange,
            "x-dead-letter-routing-key": retry_routing_key
        }
    )
    channel.queue_bind(queue=QUEUE_NAME, exchange=EXCHANGE_NAME, routing_key=ROUTING_KEY)

    # Final dead-letter queue (manual drop only)
    channel.queue_declare(queue=final_dlq, durable=True)

    logger.info(f"✅ TTL-Based DLX Ready → Queue: {QUEUE_NAME} | Retry: {retry_exchange} | TTL: {RETRY_DELAY_MS / 1000}s")
    # Start heartbeat background thread
    threading.Thread(target=heartbeat_thread, args=(connection,), daemon=True).start()

    def callback(ch, method, properties, body):
        start_time = time.time()
        try:
            task = json.loads(body)
            task_id = task.get("id")
            
            # TTL-Based DLX Pattern: Check x-death headers for retry count
            retry_count = get_retry_count(properties)
            
            logger.info(f"📦 Received task: {task_id} (retry {retry_count}/{MAX_RETRIES})")

            task_worker.handle_task(task)

            # Success - acknowledge the message
            ch.basic_ack(delivery_tag=method.delivery_tag)
            logger.info(f"✅ Task {task_id} completed")
            task_processed_total.labels(type="compress-video", status="success").inc()
            
        except Exception as e:
            task_id = task.get("id", "unknown")
            logger.error(f"⛔ Task {task_id} failed [retry {retry_count}/{MAX_RETRIES}] → {e}")
            
            task_processed_total.labels(type="compress-video", status="failed").inc()

            if retry_count >= MAX_RETRIES:
                # Final failure - send to DLQ manually
                logger.warning(f"💀 Task {task_id} exceeded retry limit, sending to final DLQ")
                task_dropped_total.labels(type="compress-video").inc()
                
                try:
                    ch.basic_publish(
                        exchange="",
                        routing_key=final_dlq,
                        body=body,
                        properties=pika.BasicProperties(content_type="application/json")
                    )
                except Exception as pub_err:
                    logger.error(f"❌ DLQ publish failed: {pub_err}")
                    
                ch.basic_ack(delivery_tag=method.delivery_tag)  # Ack to prevent redelivery
            else:
                # TTL-Based DLX Pattern: Let RabbitMQ handle retry (automatic routing)
                task_retry_attempts_total.labels("compress-video").inc()
                ch.basic_reject(delivery_tag=method.delivery_tag, requeue=False)  # Triggers DLX → retry queue

        # Record processing duration
        duration = time.time() - start_time
        task_processing_duration_seconds.labels(type="compress-video").observe(duration)

    # Start consuming
    channel.basic_qos(prefetch_count=1)
    channel.basic_consume(queue=QUEUE_NAME, on_message_callback=callback)

    try:
        channel.start_consuming()
    except KeyboardInterrupt:
        logger.warning("🛑 Consumer stopped manually")
        channel.stop_consuming()
        connection.close()
