FROM python:3.11-slim

WORKDIR /app

COPY . /app

ENV PYTHONDONTWRITEBYTECODE=1

ENV PYTHONUNBUFFERED=1



RUN pip install --upgrade pip
RUN pip install -r requirements.txt


CMD ["python", "main.py"]