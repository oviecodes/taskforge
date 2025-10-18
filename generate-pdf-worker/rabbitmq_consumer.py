import pika
from config import RABBITMQ_URL, EXCHANGE_NAME, QUEUE_NAME, ROUTING_KEY

from utils.logger import log

logger = log(service="generate-pdf")

connection = None
channel = None

# Retry queue config
RETRY_EXCHANGE = f"{EXCHANGE_NAME}.retry"
RETRY_QUEUE = f"{QUEUE_NAME}.retry"
RETRY_ROUTING_KEY = f"{ROUTING_KEY}.retry"


def connect_and_consume():
    global connection, channel

    connection = pika.BlockingConnection(pika.URLParameters(RABBITMQ_URL))

    channel = connection.channel()

    channel.exchange_declare(exchange=EXCHANGE_NAME, exchange_type="direct", durable=True)

    channel.exchange_declare(exchange=RETRY_EXCHANGE, exchange_type="direct", durable=True)

    DEAD_QUEUE = f"{QUEUE_NAME}.dead"
    DEAD_ROUTING_KEY = f"{ROUTING_KEY}.dead"
    channel.queue_declare(queue=DEAD_QUEUE, durable=True)
    channel.queue_bind(
        exchange=EXCHANGE_NAME,
        queue=DEAD_QUEUE,
        routing_key=DEAD_ROUTING_KEY
    )

    channel.queue_declare(queue=RETRY_QUEUE, durable=True, arguments={
        "x-message-ttl": 10000,
        "x-dead-letter-exchange": EXCHANGE_NAME,
        "x-dead-letter-routing-key": ROUTING_KEY
    })
    channel.queue_bind(exchange=RETRY_EXCHANGE, queue=RETRY_QUEUE, routing_key=RETRY_ROUTING_KEY)

    channel.queue_declare(queue=QUEUE_NAME, durable=True, arguments={
        "x-dead-letter-exchange": RETRY_EXCHANGE,
        "x-dead-letter-routing-key": RETRY_ROUTING_KEY
    })
    channel.queue_bind(exchange=EXCHANGE_NAME, queue=QUEUE_NAME, routing_key=ROUTING_KEY)

    return channel


def isRabbitMQHealthy():
    try:
        if connection is None or channel is None:
            return False
        
        # Check if connection is still open and channel is usable
        if connection.is_closed or channel.is_closed:
            return False
            
        return True
    except Exception as e:
        logger.error(f"RabbitMQ health check failed: {e}")
        return False
