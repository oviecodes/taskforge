import os
from dotenv import load_dotenv
load_dotenv()

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://taskforge:secretpassRabbitmq@localhost:5672")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
EXCHANGE_NAME = os.getenv("EXCHANGE_NAME", "task.exchange")
QUEUE_NAME = os.getenv("QUEUE_NAME", "task.generate-pdf")
ROUTING_KEY = os.getenv("ROUTING_KEY", "generate-pdf")
PDF_OUTPUT_DIR = os.getenv("PDF_OUTPUT_DIR", "/tmp/pdf-output")
