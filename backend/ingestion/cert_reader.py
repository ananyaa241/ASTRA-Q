"""
Aegis-Q CERT r4.2 Dataset Reader
===================================
Streams all CERT Insider Threat Dataset r4.2 CSV files with:
  - Chunked reading for large files (http.csv ~14GB, email.csv ~1.3GB)
  - Minutes-from-midnight temporal conversion
  - @dtaa.com boundary filtering (internal vs. external actors)
  - Resumable offset checkpoints
  - Sample mode for rapid development/testing
"""

from __future__ import annotations

import csv
import io
import logging
import os
import re
from datetime import datetime, time
from pathlib import Path
from typing import Generator, Iterator, Optional, Dict, Any, List

import pandas as pd

from backend.ingestion.file_validator import FileHexValidator

logger = logging.getLogger(__name__)

INTERNAL_DOMAIN = "@dtaa.com"
CHUNK_SIZE = 50_000       # Rows per chunk
SAMPLE_ROWS = 10_000      # Rows when --sample mode active

# Statutory holidays (US Federal — approximate for dataset simulation)
_HOLIDAYS = {
    "01-01", "07-04", "11-11", "11-25", "12-25",
}


def _parse_cert_datetime(dt_str: str) -> Optional[datetime]:
    """Parse CERT dataset date strings. Handles: MM/DD/YYYY HH:MM:SS"""
    formats = [
        "%m/%d/%Y %H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%m/%d/%Y %H:%M",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(dt_str.strip(), fmt)
        except ValueError:
            continue
    logger.warning(f"Could not parse date: {dt_str!r}")
    return None


def _minutes_from_midnight(dt: datetime) -> int:
    """Convert datetime to minutes elapsed since midnight: [0, 1439]."""
    return dt.hour * 60 + dt.minute


def _is_after_hours(dt: datetime) -> bool:
    """True if event occurs outside 08:00–18:00."""
    t = dt.time()
    return not (time(8, 0) <= t <= time(18, 0))


def _is_weekend(dt: datetime) -> bool:
    """True for Saturday (5) and Sunday (6)."""
    return dt.weekday() >= 5


def _is_holiday(dt: datetime) -> bool:
    return dt.strftime("%m-%d") in _HOLIDAYS


def _is_internal(email: str) -> bool:
    """True if email address belongs to the DTAA internal domain."""
    return str(email).lower().endswith(INTERNAL_DOMAIN)


# ─────────────────────────────────────────────────────────────────
# Dataset Reader
# ─────────────────────────────────────────────────────────────────

class CERTDatasetReader:
    """
    Streams CERT r4.2 dataset files with temporal enrichment.

    Usage:
        reader = CERTDatasetReader("/path/to/dataset/r4.2")
        for event in reader.stream_logon(sample=False):
            process(event)
    """

    def __init__(
        self,
        dataset_path: str,
        chunk_size: int = CHUNK_SIZE,
    ) -> None:
        self.root = Path(dataset_path)
        self.chunk_size = chunk_size
        self.validator = FileHexValidator()
        self._validate_path()

    def _validate_path(self) -> None:
        if not self.root.exists():
            raise FileNotFoundError(f"Dataset path not found: {self.root}")
        required = ["logon.csv", "device.csv", "psychometric.csv"]
        for f in required:
            if not (self.root / f).exists():
                logger.warning(f"Expected file not found: {self.root / f}")

    def _iter_csv_chunks(
        self,
        filename: str,
        sample: bool = False,
        start_offset: int = 0,
    ) -> Generator[pd.DataFrame, None, None]:
        """Generic chunked CSV iterator."""
        fpath = self.root / filename
        if not fpath.exists():
            logger.error(f"File not found: {fpath}")
            return

        nrows = SAMPLE_ROWS if sample else None
        logger.info(
            f"[CERTReader] Streaming {filename} "
            f"({'sample' if sample else 'full'}, chunk={self.chunk_size})"
        )

        for chunk in pd.read_csv(
            fpath,
            chunksize=self.chunk_size,
            nrows=nrows,
            skiprows=range(1, start_offset + 1) if start_offset > 0 else None,
            on_bad_lines="skip",
            low_memory=False,
        ):
            yield chunk

    def _enrich_temporal(self, df: pd.DataFrame, date_col: str = "date") -> pd.DataFrame:
        """
        Add temporal feature columns to a DataFrame.
        Adds: event_time, minutes_from_midnight, is_after_hours, is_weekend
        """
        df = df.copy()
        df["event_time"] = pd.to_datetime(df[date_col], format="mixed", dayfirst=False, errors="coerce")
        df["minutes_from_midnight"] = df["event_time"].dt.hour * 60 + df["event_time"].dt.minute
        df["is_after_hours"] = df["event_time"].apply(
            lambda dt: _is_after_hours(dt) if pd.notna(dt) else False
        )
        df["is_weekend"] = df["event_time"].apply(
            lambda dt: _is_weekend(dt) if pd.notna(dt) else False
        )
        df["event_type_raw"] = df.get("activity", pd.Series(["unknown"] * len(df)))
        return df

    # ─────────────────────────────────────────────────────
    # Per-File Streaming Methods
    # ─────────────────────────────────────────────────────

    def stream_logon(
        self, sample: bool = False, start_offset: int = 0
    ) -> Generator[Dict[str, Any], None, None]:
        """
        Stream logon.csv events.
        Fields: id, date, user, pc, activity (Logon/Logoff)
        """
        for chunk in self._iter_csv_chunks("logon.csv", sample, start_offset):
            chunk = self._enrich_temporal(chunk)
            for _, row in chunk.iterrows():
                yield {
                    "event_id": str(row.get("id", "")),
                    "event_type": str(row.get("activity", "logon")).lower(),
                    "event_time": row["event_time"],
                    "user_id": str(row.get("user", "")),
                    "pc_id": str(row.get("pc", "")),
                    "minutes_from_midnight": int(row["minutes_from_midnight"]),
                    "is_after_hours": bool(row["is_after_hours"]),
                    "is_weekend": bool(row["is_weekend"]),
                    "source": "logon",
                }

    def stream_device(
        self, sample: bool = False, start_offset: int = 0
    ) -> Generator[Dict[str, Any], None, None]:
        """
        Stream device.csv events.
        Fields: id, date, user, pc, activity (connect/disconnect)
        """
        for chunk in self._iter_csv_chunks("device.csv", sample, start_offset):
            chunk = self._enrich_temporal(chunk)
            for _, row in chunk.iterrows():
                yield {
                    "event_id": str(row.get("id", "")),
                    "event_type": f"dev_{str(row.get('activity', 'connect')).lower()}",
                    "event_time": row["event_time"],
                    "user_id": str(row.get("user", "")),
                    "pc_id": str(row.get("pc", "")),
                    "minutes_from_midnight": int(row["minutes_from_midnight"]),
                    "is_after_hours": bool(row["is_after_hours"]),
                    "is_weekend": bool(row["is_weekend"]),
                    "source": "device",
                }

    def stream_file(
        self, sample: bool = False, start_offset: int = 0
    ) -> Generator[Dict[str, Any], None, None]:
        """
        Stream file.csv events with hex header validation.
        Fields: id, date, user, pc, filename, content
        Content: hex_header + space-separated keywords
        """
        for chunk in self._iter_csv_chunks("file.csv", sample, start_offset):
            chunk = self._enrich_temporal(chunk)
            for _, row in chunk.iterrows():
                content = str(row.get("content", ""))
                filename = str(row.get("filename", ""))

                # Parse hex header + keywords from content
                parts = content.split(" ", 1)
                hex_header = parts[0] if parts else ""
                keywords = parts[1] if len(parts) > 1 else ""

                # Validate hex header against filename extension
                is_suspicious = self.validator.validate(hex_header, filename)

                yield {
                    "event_id": str(row.get("id", "")),
                    "event_type": "file",
                    "event_time": row["event_time"],
                    "user_id": str(row.get("user", "")),
                    "pc_id": str(row.get("pc", "")),
                    "filename": filename,
                    "hex_header": hex_header,
                    "content_keywords": keywords,
                    "is_suspicious_file": is_suspicious,
                    "minutes_from_midnight": int(row["minutes_from_midnight"]),
                    "is_after_hours": bool(row["is_after_hours"]),
                    "is_weekend": bool(row["is_weekend"]),
                    "source": "file",
                }

    def stream_email(
        self, sample: bool = False, start_offset: int = 0
    ) -> Generator[Dict[str, Any], None, None]:
        """
        Stream email.csv with @dtaa.com boundary filtering.
        Fields: id, date, user, pc, to, cc, bcc, from, size, attachment_count, content
        """
        for chunk in self._iter_csv_chunks("email.csv", sample, start_offset):
            chunk = self._enrich_temporal(chunk)
            for _, row in chunk.iterrows():
                to_addrs = str(row.get("to", ""))
                from_addr = str(row.get("from", ""))

                # Boundary analysis: internal→external = data exfil risk
                to_list = [a.strip() for a in to_addrs.split(";") if a.strip()]
                external_recipients = [a for a in to_list if not _is_internal(a)]
                is_external = len(external_recipients) > 0

                yield {
                    "event_id": str(row.get("id", "")),
                    "event_type": "email_send",
                    "event_time": row["event_time"],
                    "user_id": str(row.get("user", "")),
                    "pc_id": str(row.get("pc", "")),
                    "from_addr": from_addr,
                    "to_addrs": to_list,
                    "external_recipients": external_recipients,
                    "is_external": is_external,
                    "size_bytes": int(row.get("size", 0)),
                    "attachment_count": int(row.get("attachment_count", 0)),
                    "content_keywords": str(row.get("content", "")),
                    "minutes_from_midnight": int(row["minutes_from_midnight"]),
                    "is_after_hours": bool(row["is_after_hours"]),
                    "is_weekend": bool(row["is_weekend"]),
                    "source": "email",
                }

    def stream_http(
        self, sample: bool = False, start_offset: int = 0
    ) -> Generator[Dict[str, Any], None, None]:
        """
        Stream http.csv events (largest file ~14GB — always chunked).
        Fields: id, date, user, pc, url, content
        """
        SUSPICIOUS_DOMAINS = {
            "wikileaks.org", "dropbox.com", "pastebin.com",
            "wetransfer.com", "anonfiles.com",
        }

        for chunk in self._iter_csv_chunks("http.csv", sample, start_offset):
            chunk = self._enrich_temporal(chunk)
            for _, row in chunk.iterrows():
                url = str(row.get("url", ""))
                domain = url.split("/")[2] if url.startswith("http") else url

                is_suspicious_domain = any(
                    sd in domain.lower() for sd in SUSPICIOUS_DOMAINS
                )

                yield {
                    "event_id": str(row.get("id", "")),
                    "event_type": "http",
                    "event_time": row["event_time"],
                    "user_id": str(row.get("user", "")),
                    "pc_id": str(row.get("pc", "")),
                    "url": url,
                    "domain": domain,
                    "content_keywords": str(row.get("content", "")),
                    "is_suspicious_domain": is_suspicious_domain,
                    "minutes_from_midnight": int(row["minutes_from_midnight"]),
                    "is_after_hours": bool(row["is_after_hours"]),
                    "is_weekend": bool(row["is_weekend"]),
                    "source": "http",
                }

    def load_psychometric(self) -> pd.DataFrame:
        """Load psychometric.csv. Returns DataFrame with Big-5 traits."""
        fpath = self.root / "psychometric.csv"
        df = pd.read_csv(fpath)
        logger.info(f"[CERTReader] Loaded {len(df)} psychometric records")
        return df

    def load_ldap(self) -> pd.DataFrame:
        """Load all LDAP CSV files from the LDAP/ subdirectory."""
        ldap_dir = self.root / "LDAP"
        dfs = []
        for f in sorted(ldap_dir.glob("*.csv")):
            try:
                dfs.append(pd.read_csv(f))
            except Exception as e:
                logger.warning(f"Could not read LDAP file {f}: {e}")
        if dfs:
            combined = pd.concat(dfs, ignore_index=True)
            logger.info(f"[CERTReader] Loaded {len(combined)} LDAP records from {len(dfs)} files")
            return combined
        return pd.DataFrame()

    def load_insiders(self, answers_path: str) -> pd.DataFrame:
        """Load insiders.csv ground truth labels."""
        fpath = Path(answers_path) / "insiders.csv"
        df = pd.read_csv(fpath)
        logger.info(f"[CERTReader] Loaded {len(df)} insider threat ground truth labels")
        return df
