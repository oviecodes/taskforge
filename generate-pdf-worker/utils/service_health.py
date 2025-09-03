from utils.logger import log
from redis_publisher import isRedisHealthy
from rabbitmq_consumer import isRabbitMQHealthy

logger = log(service="generate-pdf")

def check_services_health():
    health_status = {
        "status": "Healthy",
        "services": {
            "redis": "UP",
            "rabbitMQ": "UP"
        }
    }

    if not isRabbitMQHealthy():
        logger.info("rabbitmq is not healthy")
        health_status["status"] = "Unhealthy"
        health_status["services"]["rabbitMQ"] = "DOWN"

    if not isRedisHealthy():
        logger.info("redis is not healthy")
        health_status["status"] = "Unhealthy"
        health_status["services"]["redis"] = "DOWN"
     
    return health_status


def live_test():
    return {
        "status": "Alive"
    }