FROM python:3.11-slim

LABEL maintainer="Astra-Q"
LABEL description="Astra-Q Backend — Quantum-Hardened Insider Threat Detection"

# System dependencies (for liboqs and psycopg2)
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    ninja-build \
    libssl-dev \
    pkg-config \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir -r requirements.txt

# Optional: Install PyTorch Geometric
RUN pip install --no-cache-dir torch_geometric || true

# Guarantee liboqs C-library is perfectly compiled to activate true Quantum-Proof Cryptography
ENV OQS_BUILD_NINJA=1
RUN pip install --no-cache-dir liboqs-python

# Copy source
COPY . /app/backend

# Create key storage directory
RUN mkdir -p /app/pqc_keys

# Create non-root user
RUN useradd -m -u 1000 aegis && chown -R aegis:aegis /app
USER aegis

EXPOSE 8000

CMD ["uvicorn", "backend.api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]

