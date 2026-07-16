FROM python:3.11-slim

LABEL maintainer="aegis-q"
LABEL description="Aegis-Q Backend — Quantum-Hardened Insider Threat Detection"

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

# Optional: Build liboqs for real PQC (skip if CMake not available)
# Avoid installing it in the container image because the environment may not
# have network access to the upstream liboqs repository.
RUN pip uninstall -y liboqs-python || true

# Copy source
COPY . /app/backend

# Create key storage directory
RUN mkdir -p /app/pqc_keys

# Create non-root user
RUN useradd -m -u 1000 aegis && chown -R aegis:aegis /app
USER aegis

EXPOSE 8000

CMD ["uvicorn", "backend.api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
