from flask import Flask
from dotenv import load_dotenv
from app.utils.metrics import generate_latest, CONTENT_TYPE_LATEST, registry


load_dotenv()

app = Flask(__name__)

@app.route("/metrics")
def metrics():
    return generate_latest(registry), 200, {"Content-Type": CONTENT_TYPE_LATEST}

@app.route('/')
def hello():
    return 'Hello world!'