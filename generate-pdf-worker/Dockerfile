# FROM python:3.11-slim

# WORKDIR /app

# COPY . /app

# ENV PYTHONDONTWRITEBYTECODE=1

# ENV PYTHONUNBUFFERED=1

# RUN pip install --upgrade pip
# RUN pip install -r requirements.txt

# CMD ["python", "main.py"]

FROM python:3.11-slim AS base

# Set workdir
WORKDIR /app

# Prevent Python from writing .pyc files & enable stdout flushing
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# ---- Install dependencies only ----
FROM base AS deps

# Install system packages required for building (if needed by your requirements)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy only requirements first (to leverage Docker cache)
COPY requirements.txt .

# Install Python dependencies
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ---- Final stage ----
FROM base AS production

# Create non-root user
RUN useradd -m appuser

# Copy installed dependencies from deps stage
COPY --from=deps /usr/local /usr/local

# Copy app source (only what’s needed)
COPY . .

# Use non-root user
USER appuser

# Run the service
CMD ["python", "main.py"]
