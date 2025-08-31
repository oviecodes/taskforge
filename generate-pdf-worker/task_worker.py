import json
import time
import os
import traceback
from pdf_service import generate_pdf
from redis_publisher import publish_status, cache_task_output, get_cached_output
from s3_uploader import generate_signed_url, file_exists
from utils.logger import log
from rabbitmq_consumer import connect_and_consume, QUEUE_NAME, ROUTING_KEY, EXCHANGE_NAME
from utils.metrics import (task_processed_total, task_retry_attempts_total, task_dropped_total, task_processing_duration_seconds)

MAX_RETRIES = 3
RABBITMQ_CONNECTION_RETRY = 10
RETRY_DELAY_SECONDS = 3

logger = log("generate-pdf")

def get_retry_count(properties):
    headers = properties.headers or {}
    x_death = headers.get("x-death", [])
    for death in x_death:
        if death.get("queue") == f"{QUEUE_NAME}.retry":
            return death.get("count", 0)
    return 0

def handle_message(ch, method, properties, body):
    task = json.loads(body)
    task_id = task["id"]
    trace_id = task["traceId"]
    user_id = task["userId"]
    url = task["payload"]["url"]
    pdf_options = task["payload"].get("pdfOptions", {})
    task_type = "generate-pdf"

    with logger.contextualize(taskId=task_id, traceId=trace_id):

        start_time = time.time()

        try:
            retry_count = get_retry_count(properties)
            ### check if cached
            cached = get_cached_output(task_type, task_id)
            if cached:
                publish_status(task_id, { **cached, "cached": True })
                return
            
            s3_key = f"pdf/{task_id}.{format}"

            if file_exists(os.getenv("S3_BUCKET_NAME"), s3_key):
                logger.info(f"♻️ Skipping task {task_id} — file already in S3")
                signed_url = generate_signed_url(s3_key)
                result = {
                    "success": True,
                    "url": signed_url,
                    "cached": True
                }
                publish_status(task_id, result)
                cache_task_output(task_type, task_id, result)
                return

            if retry_count >= MAX_RETRIES:
                logger.error("Max retries reached - {retries} retries", retries=retry_count)
                publish_status(task_id, "failed", 0, f"Max retries reached ({retry_count})")
                ## increment DLQ
                task_dropped_total.labels(type=task_type).inc()
                # Move to final DLQ
                ch.basic_publish(
                    exchange=EXCHANGE_NAME,
                    routing_key=f"{ROUTING_KEY}.dead",
                    body=body
                )
                ch.basic_ack(delivery_tag=method.delivery_tag)
                return

            logger.info("Received task - {retryCount}", retryCount=retry_count)
            publish_status(task_id, "processing", 10, "Starting PDF generation")

            pdf_response = generate_pdf(task_id, url, trace_id)

            print(pdf_response)

            publish_status(task_id, "completed", 100, "PDF uploaded", fileUrl=pdf_response["url"])
            cache_task_output(task_type, task_id, {
                "url": pdf_response["url"]
            })
            logger.info("Task completed \n {fileUrl}", fileUrl=pdf_response["url"])

            task_processed_total.labels(type=task_type, status="success").inc()

            ch.basic_ack(delivery_tag=method.delivery_tag)

        except Exception as e:
            tb = traceback.format_exc()
            logger.error("Task failed \n {error} \n {traceback}", error=str(e), traceback=tb)

            task_processed_total.labels(type=task_type, status="failed").inc()

            ## increment metrics retry count
            task_retry_attempts_total.labels(type=task_type).inc()
            try:
                task = json.loads(body)
                task_id = task.get("id", "unknown")
            except:
                task_id = "unknown"

            publish_status(task_id, "failed", 0, str(e))
            ch.basic_reject(delivery_tag=method.delivery_tag, requeue=False)
    
        duration = time.time() - start_time
        task_processing_duration_seconds.labels(type=task_type).observe(duration)
        

def start_worker():
    tries = 0
    channel = {}

    while tries < RABBITMQ_CONNECTION_RETRY:
        try:
            logger.info(f"🔁 [Worker] Connecting to RabbitMQ... attempt {tries + 1}")
            channel = connect_and_consume()
            break  # ✅ Connected successfully, exit loop
        except Exception as e:
            tries += 1
            logger.warning(f"❌ [Worker] RabbitMQ connection failed: {e}", e)

            if tries >= RABBITMQ_CONNECTION_RETRY:
                logger.critical("💥 [Worker] Max retry attempts reached. Exiting.")
                raise Exception("Cannot connect to RabbitMQ") from e

            logger.info(f"⏳ [Worker] Retrying in {RETRY_DELAY_SECONDS} seconds...")
            time.sleep(RETRY_DELAY_SECONDS)

    # Start consuming
    logger.info("🐇 Waiting for messages (with retry/DLQ support)...")

    channel.basic_qos(prefetch_count=1)
    channel.basic_consume(queue=QUEUE_NAME, on_message_callback=handle_message)
    
    channel.start_consuming()




