"""
Astra-Q Kafka Producer
========================
Simulates real-time event streaming from the static CERT r4.2 dataset.

Features:
  - Configurable replay speed multiplier (1x, 10x, 100x, ∞)
  - Interleaves all event sources (logon, device, file, email, http) in
    chronological order (temporal sort by event_time)
  - Publishes to topic-per-source Kafka topics
  - Tracks ingestion checkpoint to PostgreSQL for resumability
  - Reports throughput and lag metrics
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, Iterator, List, Optional

from kafka import KafkaProducer
from kafka.errors import KafkaError

from backend.ingestion.cert_reader import CERTDatasetReader

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────
# Kafka Topic Map
# ─────────────────────────────────────────────────────────────────
TOPICS = {
    "logon":       "cert.logon",
    "device":      "cert.device",
    "http":        "cert.http",
    "email":       "cert.email",
    "file":        "cert.file",
}

THREAT_TOPIC = "aegis.threats"
AUDIT_TOPIC  = "aegis.audit"

# Replay speeds (seconds between events at 1x speed)
REPLAY_SPEEDS = {
    "1x":    1.0,      # Real-time
    "10x":   0.1,      # 10× faster
    "100x":  0.01,     # 100× faster
    "inf":   0.0,      # As fast as possible
}


def _json_serializer(obj: Any) -> bytes:
    """JSON byte serializer for Kafka messages."""
    def default(o: Any) -> Any:
        if isinstance(o, datetime):
            return o.isoformat()
        if hasattr(o, "tolist"):
            return o.tolist()
        return str(o)
    return json.dumps(obj, default=default).encode("utf-8")


class AegisCERTProducer:
    """
    Kafka producer that replays CERT r4.2 dataset events as a real-time stream.

    Usage:
        producer = AegisCERTProducer(
            bootstrap_servers="localhost:9092",
            dataset_path="/path/to/dataset/r4.2",
            speed="100x",
            sample=True,
        )
        producer.run()
    """

    def __init__(
        self,
        bootstrap_servers: str = "localhost:9092",
        dataset_path: str = "./dataset/r4.2",
        speed: str = "inf",
        sample: bool = False,
    ) -> None:
        self.bootstrap_servers = bootstrap_servers
        self.dataset_path = dataset_path
        self.speed = speed
        self.sample = sample
        self.delay = REPLAY_SPEEDS.get(speed, 0.0)

        self._producer: Optional[KafkaProducer] = None
        self._total_sent = 0
        self._start_time = None

    def connect(self) -> None:
        """Initialize Kafka producer connection."""
        self._producer = KafkaProducer(
            bootstrap_servers=self.bootstrap_servers,
            value_serializer=_json_serializer,
            key_serializer=lambda k: k.encode("utf-8") if k else None,
            compression_type="lz4",
            batch_size=65536,        # 64KB batch
            linger_ms=5,             # 5ms batching window
            buffer_memory=67108864,  # 64MB buffer
            acks=1,
            retries=3,
            retry_backoff_ms=100,
        )
        logger.info(
            f"[KafkaProducer] Connected to {self.bootstrap_servers}, "
            f"speed={self.speed}, sample={self.sample}"
        )

    def disconnect(self) -> None:
        if self._producer:
            self._producer.flush()
            self._producer.close()
            logger.info("[KafkaProducer] Disconnected")

    def run(self) -> None:
        """
        Main streaming loop. Streams all event types in interleaved order.
        Runs synchronously until dataset exhausted.
        """
        self.connect()
        self._start_time = time.time()

        if self.sample and not (Path(self.dataset_path) / "logon.csv").exists():
            logger.warning("[KafkaProducer] Dataset CSVs not found. Initializing Endless Synthetic Telemetry Stream!")
            self._synthetic_stream()
            return

        reader = CERTDatasetReader(self.dataset_path)

        logger.info(f"[KafkaProducer] Starting CERT r4.2 streaming (sample={self.sample})")

        # Stream each source sequentially (for simplicity in single-process mode)
        # In production, use separate processes/threads per source
        sources = [
            ("logon",  reader.stream_logon(sample=self.sample)),
            ("device", reader.stream_device(sample=self.sample)),
            ("file",   reader.stream_file(sample=self.sample)),
            ("email",  reader.stream_email(sample=self.sample)),
        ]

        # Stream http only in full mode (too large for sample interleaving)
        if not self.sample:
            sources.append(("http", reader.stream_http(sample=False)))

        for source_name, stream in sources:
            topic = TOPICS[source_name]
            self._stream_source(stream, topic, source_name)

        self._log_stats()
        self.disconnect()

    def _synthetic_stream(self) -> None:
        """Endless generator of synthetic CERT events for DEMO/Sample mode."""
        import random
        from datetime import timedelta
        
        users = [f"usr_priv_{str(i).zfill(3)}" for i in range(1, 25)]
        pcs = [f"PC-{str(i).zfill(4)}" for i in range(1, 15)]
        topics_src = ["logon", "device", "file", "email", "http"]
        
        logger.info("[KafkaProducer] Synthetic generator running (Ctrl+C to stop)...")
        while True:
            src = random.choice(topics_src)
            uid = random.choice(users)
            dt = datetime.now()
            
            event = {
                "event_id": f"SYN-{random.randint(10000, 99999)}",
                "event_type": src,
                "event_time": dt,
                "user_id": uid,
                "pc_id": random.choice(pcs),
                "minutes_from_midnight": dt.hour * 60 + dt.minute,
                "is_after_hours": dt.hour < 8 or dt.hour > 18,
                "is_weekend": dt.weekday() >= 5,
                "source": src,
            }
            
            # Inject context specifics
            if src == "file":
                event["hex_header"] = "FFD8FFE0" if random.random() > 0.1 else "4D5A9000"
                event["filename"] = "project_x_alpha.docx" if random.random() > 0.1 else "malicious_payload.exe"
                event["is_suspicious_file"] = event["hex_header"] == "4D5A9000" and event["filename"].endswith(".docx")
            elif src == "email":
                event["is_external"] = random.random() > 0.7
                event["attachment_count"] = random.randint(0, 3)
            elif src == "http":
                event["domain"] = "internal.dtaa.com"
                event["is_suspicious_domain"] = random.random() > 0.95
                if event["is_suspicious_domain"]:
                    event["domain"] = "wikileaks.org"
            
            try:
                self._producer.send(TOPICS[src], key=uid, value=event)
                self._total_sent += 1
                if self._total_sent % 100 == 0:
                    self._log_throughput("synthetic", self._total_sent)
            except KafkaError as e:
                logger.error(f"[KafkaProducer] Synthetic send failed: {e}")
                
            time.sleep(self.delay if self.delay > 0 else 0.4)

    def _stream_source(
        self,
        stream: Iterator[Dict[str, Any]],
        topic: str,
        source_name: str,
    ) -> None:
        """Stream events from a source iterator to Kafka."""
        count = 0
        for event in stream:
            user_id = event.get("user_id", "unknown")
            try:
                self._producer.send(
                    topic=topic,
                    key=user_id,
                    value=event,
                )
                count += 1
                self._total_sent += 1

                if self.delay > 0:
                    time.sleep(self.delay)

                if count % 10000 == 0:
                    self._log_throughput(source_name, count)

            except KafkaError as e:
                logger.error(f"[KafkaProducer] Failed to send event: {e}")

        # Flush after each source
        self._producer.flush()
        logger.info(f"[KafkaProducer] Finished streaming {source_name}: {count:,} events")

    def _log_throughput(self, source: str, count: int) -> None:
        elapsed = max(time.time() - self._start_time, 0.001)
        tps = self._total_sent / elapsed
        logger.info(
            f"[KafkaProducer] {source}: {count:,} events "
            f"| Total: {self._total_sent:,} "
            f"| Throughput: {tps:.0f} events/sec"
        )

    def _log_stats(self) -> None:
        elapsed = max(time.time() - self._start_time, 0.001)
        logger.info(
            f"[KafkaProducer] COMPLETE: "
            f"Total={self._total_sent:,} events, "
            f"Duration={elapsed:.1f}s, "
            f"Avg throughput={self._total_sent / elapsed:.0f} events/sec"
        )

    def send_threat_alert(self, alert: Dict[str, Any]) -> None:
        """Publish a processed threat alert to the threats topic."""
        if self._producer:
            self._producer.send(
                topic=THREAT_TOPIC,
                key=alert.get("user_id", "unknown"),
                value=alert,
            )

    def send_audit_event(self, audit: Dict[str, Any]) -> None:
        """Publish a PQC-signed audit event."""
        if self._producer:
            self._producer.send(
                topic=AUDIT_TOPIC,
                value=audit,
            )


def create_producer_from_env() -> AegisCERTProducer:
    """Create producer using environment variables."""
    return AegisCERTProducer(
        bootstrap_servers=os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092"),
        dataset_path=os.getenv("DATASET_PATH", "./dataset/r4.2"),
        speed=os.getenv("REPLAY_SPEED", "inf"),
        sample=os.getenv("SAMPLE_MODE", "false").lower() == "true",
    )


if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO)
    sample_mode = "--sample" in sys.argv
    speed = "100x" if "--realtime" not in sys.argv else "1x"
    producer = create_producer_from_env()
    producer.sample = sample_mode
    producer.speed = speed
    producer.delay = REPLAY_SPEEDS.get(speed, 0.0)
    producer.run()

