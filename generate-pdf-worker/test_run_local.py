import uuid
from pdf_service import generate_pdf
from redis_publisher import publish_status
from utils.logger import log

# Simulate a task
task_id = str(uuid.uuid4())
url = "https://example.com"

log("info", "Starting local PDF test", taskId=task_id)
publish_status(task_id, "processing", 5, "Starting local test")

try:
    pdf_path = generate_pdf(task_id, url)
    publish_status(task_id, "completed", 100, f"PDF created at {pdf_path}")
    log("success", "PDF generated", path=pdf_path)

except Exception as e:
    publish_status(task_id, "failed", 0, str(e))
    log("error", "Failed to generate PDF", error=str(e))
