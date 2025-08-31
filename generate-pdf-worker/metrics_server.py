from flask import Flask
from dotenv import load_dotenv
from utils.metrics import generate_latest, CONTENT_TYPE_LATEST, registry


load_dotenv()

app = Flask(__name__)

@app.route("/metrics")
def metrics():
    return generate_latest(registry), 200, {"Content-Type": CONTENT_TYPE_LATEST}

@app.route("/live")
def live():
    return "OK", 200, {"Content-Type": "text/plain"}

@app.route("/health")
def health():
    return "OK", 200, {"Content-Type": "text/plain"}

@app.route('/')
def hello():
    return 'Hello world!'