from loguru import logger
import sys

# Configure loguru for structured JSON output
logger.remove()
logger.add(
    sys.stdout,
    serialize=True,  # Output as JSON
    level="INFO"
)

def log(service: str):
    return logger.bind(service=service)
