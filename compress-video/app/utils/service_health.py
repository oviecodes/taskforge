from .logger import log
from app.redis_client import isRedisHealthy
from app.consumer import isRabbitMQHealthy

logger = log(service="compress-video")

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
     
    print(health_status)
    return health_status


def live_test():
    return {
        "status": "Alive"
    }