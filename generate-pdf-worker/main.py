import os
import threading
from dotenv import load_dotenv

from task_worker import start_worker
from metrics_server import app

def run_metrics_server():
    """Run the metrics server in a separate thread"""
    port = int(os.getenv('PORT', '8000'))
    print(f'Starting metrics server on port {port}')
    try:
        app.run(host='0.0.0.0', port=port, debug=False) 
    except Exception as e:
        print(f'Metrics server failed to start: {e}')

if __name__ == "__main__":
    load_dotenv()
    
    # Start metrics server in background thread
    metrics_thread = threading.Thread(target=run_metrics_server, daemon=True)
    metrics_thread.start()
    
    # Start the main RabbitMQ worker (blocking)
    print('Starting RabbitMQ worker...')
    try:
        start_worker()
    except Exception as e:
        print(f'Worker failed to start: {e}')
        exit(1)