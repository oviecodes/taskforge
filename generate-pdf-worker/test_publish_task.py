import pika
import uuid
import json
import os
from config import RABBITMQ_URL

connection = pika.BlockingConnection(pika.URLParameters("amqp://taskforge:secretpassRabbitmq@localhost:5672"))
channel = connection.channel()

exchange = "task.exchange"
routing_key = "generate-pdf"

task_id = str(uuid.uuid4())

task = {
    "id": task_id,
    "type": "generate-pdf",
    "userId": "test-user",
    "payload": {
        "url": "https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/s3.html",
        # "pdfOptions": {
        #     "format": "A4",
        #     "printBackground": True
        # }
    },
    "createdAt": "2025-07-03T12:00:00Z",
    "traceId": str(uuid.uuid4())
}

channel.basic_publish(
    exchange=exchange,
    routing_key=routing_key,
    body=json.dumps(task)
)

print(f"✅ Task published: {task_id}")

task = {
    "id": "abcd1234-5678-9012-efgh-3456ijkl7890",
    "type": "resize-image",
    "userId": "test-user",
    "traceId": "trace-001",
    "createdAt": "2025-07-15T12:00:00Z",
    "payload": {
        "imageUrl": "https://images.unsplash.com/photo-1522202176988-66273c2fd55f",
        "width": 400,
        "height": 300
    }
}

channel.basic_publish(
    exchange='task.exchange',
    routing_key='resize-image',
    body=json.dumps(task),
    properties=pika.BasicProperties(content_type='application/json')
)

print(f"✅ Task published: {task['id']}")

msg = {
    "id": "video-task-123",
    "type": "compress-video",
    "userId": "user-456",
    "payload": {
        "videoUrl": "https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_2mb.mp4",
        "format": "mp4",
        "bitrate": "900k",
        "preset": "fast"
    },
    "createdAt": "2025-07-29T11:00:00Z",
    "traceId": "trace-abc-789"
}

channel.basic_publish(
    exchange="task.exchange",
    routing_key="compress-video",
    body=json.dumps(msg),
    properties=pika.BasicProperties(content_type="application/json")
)

print("✅ Message published.")

connection.close()
