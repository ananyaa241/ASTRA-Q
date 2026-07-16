#!/bin/bash
# Kafka topic initialization script for Astra-Q
# Creates all required topics with production-grade settings

KAFKA_HOST=${KAFKA_BOOTSTRAP_SERVERS:-kafka:9092}
PARTITIONS=${KAFKA_PARTITIONS:-3}
REPLICATION=${KAFKA_REPLICATION:-1}

echo "[Kafka Init] Waiting for Kafka at $KAFKA_HOST..."
sleep 5

declare -a TOPICS=(
  "cert.logon"
  "cert.device"
  "cert.http"
  "cert.email"
  "cert.file"
  "aegis.threats"
  "aegis.audit"
)

for topic in "${TOPICS[@]}"; do
  kafka-topics.sh \
    --bootstrap-server "$KAFKA_HOST" \
    --create \
    --if-not-exists \
    --topic "$topic" \
    --partitions "$PARTITIONS" \
    --replication-factor "$REPLICATION" \
    --config retention.ms=86400000 \
    --config compression.type=lz4
  echo "[Kafka Init] Topic created: $topic"
done

echo "[Kafka Init] All topics ready."

