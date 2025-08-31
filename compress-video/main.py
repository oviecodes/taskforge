import os
import threading
from dotenv import load_dotenv

from app.consumer import start_consumer
from app.metrics_server import app

def run_metrics_server():
    """Run the metrics server in a separate thread"""
    port = int(os.getenv('PORT', '8100'))
    print(f'Starting metrics server on port {port}')
    try:
        app.run(host='0.0.0.0', port=port, debug=False)  # debug=False for metrics server
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
        start_consumer()
    except Exception as e:
        print(f'Worker failed to start: {e}')
        exit(1)