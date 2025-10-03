# # Stage 1: Base image with dependencies
# FROM python:3.11-slim

# # Prevents Python from writing .pyc files to disk
# ENV PYTHONDONTWRITEBYTECODE=1
# # Ensures stdout/stderr are unbuffered
# ENV PYTHONUNBUFFERED=1

# # Set working directory
# WORKDIR /usr/src/app

# # Install system dependencies
# RUN apt-get update && apt-get install -y \
#     ffmpeg \
#     curl \
#     gcc \
#     libpq-dev \
#     && apt-get clean \
#     && rm -rf /var/lib/apt/lists/*

# # Install Python dependencies
# COPY requirements.txt .
# RUN pip install --upgrade pip && pip install -r requirements.txt

# # Copy app
# COPY . .

# # Entrypoint
# CMD ["python", "main.py"]

# ---- Stage 1: builder ----
FROM python:3.11-slim AS builder

# Prevent pyc files + enable unbuffered logs
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /usr/src/app

# Install system deps (only what’s needed for builds)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for caching
COPY requirements.txt .

# Install deps into a target dir (to copy later without pip cache/build tools)
RUN pip install --upgrade pip && \
    pip install --no-cache-dir --prefix=/install -r requirements.txt


# ---- Stage 2: final runtime ----
FROM python:3.11-slim

# Install only runtime OS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create app dir + non-root user
WORKDIR /usr/src/app
RUN useradd -m appuser

# Copy Python deps from builder
COPY --from=builder /install /usr/local

# Copy app source
COPY . .

# Drop root
USER appuser

# Healthcheck (optional, for K8s readiness)
# HEALTHCHECK CMD curl --fail http://localhost:8000/health || exit 1

CMD ["python", "main.py"]

