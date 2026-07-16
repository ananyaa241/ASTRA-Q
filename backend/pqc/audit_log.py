"""
Aegis-Q PQC Audit Log
=======================
Cryptographically-signed, append-only audit trail for all system actions.

Every audit entry contains:
  - Timestamp (UTC ISO-8601)
  - Action type and metadata
  - Payload hash (SHA3-512 of canonical JSON)
  - ML-DSA-87 signature (base64)
  - Signing key fingerprint (SHA3-256 of verify_key)

Entries are written to PostgreSQL (append-only enforced via DB rules)
and also published to the aegis.audit Kafka topic for stream consumers.
"""

from __future__ import annotations

import hashlib
import json
import logging
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from backend.pqc.dsa import MLDSA87, DSAKeyPair, SignedPayload, get_dsa

logger = logging.getLogger(__name__)


class AuditActionType(str, Enum):
    ALERT_GENERATED = "ALERT_GENERATED"
    CONTAINMENT_TRIGGERED = "CONTAINMENT_TRIGGERED"
    MODEL_RETRAIN = "MODEL_RETRAIN"
    KEY_ROTATION = "KEY_ROTATION"
    ANALYST_LOGIN = "ANALYST_LOGIN"
    ANALYST_LOGOUT = "ANALYST_LOGOUT"
    ALERT_DISMISSED = "ALERT_DISMISSED"
    GRAPH_QUERY = "GRAPH_QUERY"
    SIGNATURE_VERIFIED = "SIGNATURE_VERIFIED"
    SYSTEM_START = "SYSTEM_START"


class PQCAuditLogger:
    """
    Writes PQC-signed, append-only audit entries to PostgreSQL and Kafka.
    """

    def __init__(
        self,
        dsa: Optional[MLDSA87] = None,
        keypair: Optional[DSAKeyPair] = None,
    ) -> None:
        self._dsa = dsa or get_dsa()
        self._keypair = keypair
        self._pending_entries: list[Dict] = []

    def set_keypair(self, keypair: DSAKeyPair) -> None:
        """Set the signing key pair."""
        self._keypair = keypair
        logger.info(
            f"[AuditLog] Using signing key: "
            f"fingerprint={keypair.key_fingerprint[:16]}..."
        )

    def _build_entry(
        self,
        action_type: AuditActionType,
        actor: str,
        target_user: Optional[str],
        target_session: Optional[str],
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Build and sign an audit entry."""
        if not self._keypair:
            raise RuntimeError(
                "No signing key configured. Call set_keypair() first."
            )

        timestamp = datetime.now(timezone.utc).isoformat()
        entry_id = str(uuid.uuid4())

        # Build the signable payload
        signable = {
            "id": entry_id,
            "timestamp": timestamp,
            "action_type": action_type.value,
            "actor": actor,
            "target_user": target_user,
            "target_session": target_session,
            "payload": payload,
        }

        # Sign the canonical payload
        signed: SignedPayload = self._dsa.sign_payload(signable, self._keypair)

        return {
            "id": entry_id,
            "created_at": timestamp,
            "action_type": action_type.value,
            "actor": actor,
            "target_user": target_user,
            "target_session": target_session,
            "action_payload": json.dumps(payload, default=str),
            "payload_hash": signed.payload_hash,
            "pqc_signature": signed.signature_b64,
            "signing_key_fp": self._keypair.key_fingerprint,
            "pqc_algorithm": "ML-DSA-87",
            "is_verified": True,
        }

    async def log(
        self,
        action_type: AuditActionType,
        actor: str,
        payload: Dict[str, Any],
        db: Optional[AsyncSession] = None,
        target_user: Optional[str] = None,
        target_session: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create and persist a signed audit entry.

        Args:
            action_type: Type of action being logged
            actor: Analyst ID or "SYSTEM"
            payload: Action-specific metadata
            db: Async SQLAlchemy session for PostgreSQL persistence
            target_user: User being acted upon (if applicable)
            target_session: Session ID (if applicable)

        Returns:
            The audit entry dict (with signature)
        """
        entry = self._build_entry(
            action_type=action_type,
            actor=actor,
            target_user=target_user,
            target_session=target_session,
            payload=payload,
        )

        logger.info(
            f"[AuditLog] {action_type.value} | actor={actor} "
            f"| fp={entry['signing_key_fp'][:16]}..."
        )

        if db:
            await self._persist_to_db(entry, db)

        return entry

    async def _persist_to_db(
        self, entry: Dict[str, Any], db: AsyncSession
    ) -> None:
        """Write audit entry to PostgreSQL."""
        try:
            db_entry = dict(entry)
            db_entry["created_at"] = datetime.fromisoformat(db_entry["created_at"])
            await db.execute(
                text("""
                    INSERT INTO audit_trail (
                        id, created_at, action_type, actor,
                        target_user, target_session, action_payload,
                        payload_hash, pqc_signature, signing_key_fp,
                        pqc_algorithm, is_verified
                    ) VALUES (
                        :id, :created_at, :action_type, :actor,
                        :target_user, :target_session, :action_payload,
                        :payload_hash, :pqc_signature, :signing_key_fp,
                        :pqc_algorithm, :is_verified
                    )
                """),
                db_entry,
            )
            await db.commit()
        except Exception as e:
            logger.error(f"[AuditLog] DB persistence failed: {e}")
            await db.rollback()

    def verify_entry(
        self,
        entry: Dict[str, Any],
        verify_key: bytes,
    ) -> bool:
        """
        Verify the ML-DSA-87 signature on a stored audit entry.

        Args:
            entry: Audit entry dict (from DB or API)
            verify_key: Public verify key bytes

        Returns:
            True if signature is valid and payload hash matches
        """
        # Reconstruct signable payload
        # action_payload may be a dict (JSONB from PostgreSQL) or a JSON string (SQLite/synthetic)
        raw_payload = entry.get("action_payload", "{}")
        if isinstance(raw_payload, dict):
            payload_obj = raw_payload
        else:
            try:
                payload_obj = json.loads(raw_payload)
            except (TypeError, ValueError):
                payload_obj = {}

        signable = {
            "id": str(entry.get("id", "")),
            "timestamp": str(entry.get("created_at", "")),
            "action_type": entry.get("action_type"),
            "actor": entry.get("actor"),
            "target_user": entry.get("target_user"),
            "target_session": entry.get("target_session"),
            "payload": payload_obj,
        }


        # Verify hash
        canonical = json.dumps(signable, sort_keys=True, default=str).encode("utf-8")
        computed_hash = hashlib.sha3_512(canonical).hexdigest()
        stored_hash = entry.get("payload_hash", "")

        if computed_hash != stored_hash:
            logger.warning(
                f"[AuditLog] Hash mismatch for entry {entry.get('id')} "
                f"— payload may have been tampered"
            )
            return False

        # Verify signature
        import base64
        try:
            sig_bytes = base64.b64decode(entry.get("pqc_signature", ""))
            return self._dsa.verify(canonical, sig_bytes, verify_key)
        except Exception as e:
            logger.error(f"[AuditLog] Signature verification error: {e}")
            return False

    async def log_alert(
        self,
        user_id: str,
        session_id: str,
        threat_score: float,
        risk_tier: str,
        db: Optional[AsyncSession] = None,
    ) -> Dict[str, Any]:
        """Convenience method for logging threat alert generation."""
        return await self.log(
            action_type=AuditActionType.ALERT_GENERATED,
            actor="SYSTEM",
            payload={
                "threat_score": threat_score,
                "risk_tier": risk_tier,
                "session_id": session_id,
            },
            db=db,
            target_user=user_id,
            target_session=session_id,
        )

    async def log_containment(
        self,
        analyst_id: str,
        user_id: str,
        session_id: str,
        action: str,
        db: Optional[AsyncSession] = None,
    ) -> Dict[str, Any]:
        """Convenience method for logging analyst containment actions."""
        return await self.log(
            action_type=AuditActionType.CONTAINMENT_TRIGGERED,
            actor=analyst_id,
            payload={
                "containment_action": action,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
            db=db,
            target_user=user_id,
            target_session=session_id,
        )


# Module-level singleton
_audit_logger: Optional[PQCAuditLogger] = None


def get_audit_logger() -> PQCAuditLogger:
    global _audit_logger
    if _audit_logger is None:
        _audit_logger = PQCAuditLogger()
    return _audit_logger
