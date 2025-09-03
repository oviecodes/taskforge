from flask import Flask
from dotenv import load_dotenv
from utils.metrics import generate_latest, CONTENT_TYPE_LATEST, registry
from utils.service_health import check_services_health, live_test


load_dotenv()

app = Flask(__name__)

@app.route("/metrics")
def metrics():
    return generate_latest(registry), 200, {"Content-Type": CONTENT_TYPE_LATEST}

@app.route("/live")
def live():
    return live_test(), 200, {"Content-Type": "application/json"}

@app.route("/health")
def health():
    health_status = check_services_health()
    code = 200 if health_status["status"] == "Healthy" else 500
    return health_status, code, {"Content-Type": "application/json"}

@app.route('/')
def hello():
    return 'Hello world!'