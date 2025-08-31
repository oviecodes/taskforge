import os
import requests

from utils.logger import log


logger = log(service="generate-pdf")

CHROMIUM_RENDERER_URL = os.getenv("CHROMIUM_RENDERER_URL", "http://chromium-renderer:3000")
CHROMIUM_RENDERER_TOKEN = os.getenv("CHROMIUM_RENDERER_TOKEN")

def generate_pdf(task_id, payload, trace_id):
    url = payload
    if not url:
        raise ValueError("Missing URL in payload")
    
    with logger.contextualize(taskId=task_id, traceId=trace_id):

        try:
            response = requests.post(
                f"{CHROMIUM_RENDERER_URL}/render/pdf",
                json={ "url": url, "task_id": task_id },
                headers={ "Authorization": f"Bearer {CHROMIUM_RENDERER_TOKEN}" },
                timeout=60
            )

            if response.status_code != 200:
                logger.error("Renderer failed: {statusCode} - {text}", statusCode=response.status_code, text=response.text)
                raise Exception(f"Renderer failed: {response.status_code} - {response.text}")

            result = response.json()
            return {
                "success": True,
                "url": result["url"]
            }

        except Exception as e:
            logger.error(f"[ERROR] PDF render failed: {str(e)}", e)
            return {
                "success": False,
                "error": str(e)
            }
