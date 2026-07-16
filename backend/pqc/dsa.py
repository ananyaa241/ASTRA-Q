"""
Astra-Q PQC: ML-DSA-87 Digital Signature
==========================================
Implements FIPS 204 ML-DSA-87 (Module Lattice Digital Signature Algorithm)
for cryptographic signing of all security alerts and containment actions.

Every threat alert emitted by Astra-Q is signed with ML-DSA-87, providing:
  - Non-repudiation: Analyst/system action is cryptographically provable
  - Integrity: Alert payload cannot be modified in transit
  - Quantum resistance: Secure against Shor's algorithm / quantum adversaries

Key Operations:
  1. generate_keypair() → (signing_key, verify_key)
  2. sign(message, sk)  → signature
  3. verify(message, sig, vk) → bool

Uses liboqs (Open Quantum Safe) with a labeled placeholder fallback.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

try:
    import oqs
    LIBOQS_AVAILABLE = True
    logger.info("[PQC/DSA] liboqs available — using real ML-DSA-87")
except ImportError:
    LIBOQS_AVAILABLE = False
    logger.warning("[PQC/DSA] liboqs NOT available. Using HMAC-SHA3-512 placeholder.")

DSA_ALGORITHM = "ML-DSA-87"
KEY_DIR = os.getenv("PQC_KEY_DIR", "./pqc_keys")
from backend.utils.keywrap import get_kek, decrypt_bytes


@dataclass
class DSAKeyPair:
    """ML-DSA-87 key pair."""
    signing_key: bytes    # Private — keep secret
    verify_key: bytes     # Public — shareable
    algorithm: str = DSA_ALGORITHM
    key_fingerprint: str = ""

    def __post_init__(self) -> None:
        self.key_fingerprint = hashlib.sha3_256(self.verify_key).hexdigest()


@dataclass
class SignedPayload:
    """A canonicalized, signed payload with full provenance."""
    payload: Dict[str, Any]
    signature_b64: str
    signing_key_fingerprint: str
    algorithm: str = DSA_ALGORITHM
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    payload_hash: str = ""

    def __post_init__(self) -> None:
        canonical = self._canonicalize(self.payload)
        self.payload_hash = hashlib.sha3_512(canonical).hexdigest()

    @staticmethod
    def _canonicalize(payload: Dict[str, Any]) -> bytes:
        """Deterministic JSON serialization for consistent hashing."""
        return json.dumps(payload, sort_keys=True, default=str).encode("utf-8")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "payload": self.payload,
            "signature": self.signature_b64,
            "payload_hash": self.payload_hash,
            "signing_key_fingerprint": self.signing_key_fingerprint,
            "algorithm": self.algorithm,
            "timestamp": self.timestamp,
        }


class MLDSA87:
    """
    ML-DSA-87 digital signature wrapper for signing and verifying alerts.
    """

    def __init__(self) -> None:
        if LIBOQS_AVAILABLE:
            self._sig = oqs.Signature(DSA_ALGORITHM)
        else:
            self._sig = None

    def generate_keypair(self) -> DSAKeyPair:
        """Generate an ML-DSA-87 signing key pair."""
        if LIBOQS_AVAILABLE and self._sig:
            verify_key = self._sig.generate_keypair()
            signing_key = self._sig.export_secret_key()
            logger.info(
                f"[PQC/DSA] Generated ML-DSA-87 key pair "
                f"(vk={len(verify_key)}B, sk={len(signing_key)}B)"
            )
            return DSAKeyPair(signing_key=signing_key, verify_key=verify_key)
        else:
            return self._placeholder_keypair()

    def sign(
        self,
        message: bytes,
        signing_key: bytes,
    ) -> bytes:
        """
        Sign a message with the private signing key.

        Returns:
            signature bytes (ML-DSA-87: ~4595 bytes)
        """
        if LIBOQS_AVAILABLE:
            with oqs.Signature(DSA_ALGORITHM, signing_key) as signer:
                signature = signer.sign(message)
            return signature
        else:
            return self._placeholder_sign(message, signing_key)

    def verify(
        self,
        message: bytes,
        signature: bytes,
        verify_key: bytes,
    ) -> bool:
        """
        Verify a message signature using the public verify key.

        Returns:
            True if signature is valid, False otherwise
        """
        if LIBOQS_AVAILABLE:
            try:
                with oqs.Signature(DSA_ALGORITHM) as verifier:
                    return verifier.verify(message, signature, verify_key)
            except Exception as e:
                logger.warning(f"[PQC/DSA] Verification failed: {e}")
                return False
        else:
            return self._placeholder_verify(message, signature, verify_key)

    def sign_payload(
        self,
        payload: Dict[str, Any],
        keypair: DSAKeyPair,
    ) -> SignedPayload:
        """
        Sign a JSON-serializable payload dict.

        Args:
            payload: The threat alert or audit action to sign
            keypair: ML-DSA-87 key pair

        Returns:
            SignedPayload with b64-encoded signature and provenance metadata
        """
        canonical = json.dumps(payload, sort_keys=True, default=str).encode("utf-8")
        signature_bytes = self.sign(canonical, keypair.signing_key)
        signature_b64 = base64.b64encode(signature_bytes).decode("ascii")

        return SignedPayload(
            payload=payload,
            signature_b64=signature_b64,
            signing_key_fingerprint=keypair.key_fingerprint,
            algorithm=DSA_ALGORITHM,
        )

    def verify_signed_payload(
        self,
        signed: SignedPayload | Dict[str, Any],
        verify_key: bytes,
    ) -> bool:
        """
        Verify a SignedPayload or its dict representation.
        """
        if isinstance(signed, dict):
            payload = signed.get("payload", {})
            sig_b64 = signed.get("signature", "")
        else:
            payload = signed.payload
            sig_b64 = signed.signature_b64

        try:
            canonical = json.dumps(payload, sort_keys=True, default=str).encode("utf-8")
            signature_bytes = base64.b64decode(sig_b64)
            result = self.verify(canonical, signature_bytes, verify_key)
            if result:
                logger.debug("[PQC/DSA] Signature verified ✓")
            else:
                logger.warning("[PQC/DSA] Signature verification FAILED ✗")
            return result
        except Exception as e:
            logger.error(f"[PQC/DSA] Verification error: {e}")
            return False

    # ─────────────────────────────────────────────────────
    # Placeholder (development mode)
    # ─────────────────────────────────────────────────────

    def _placeholder_keypair(self) -> DSAKeyPair:
        logger.warning("[PQC/DSA] PLACEHOLDER MODE — NOT SECURE FOR PRODUCTION")
        # Placeholder: use random bytes as keys
        sk = os.urandom(4032)   # ML-DSA-87 signing key size
        vk = os.urandom(2592)   # ML-DSA-87 verify key size
        return DSAKeyPair(signing_key=sk, verify_key=vk)

    def _placeholder_sign(self, message: bytes, signing_key: bytes) -> bytes:
        """HMAC-SHA3-512 placeholder (NOT quantum-resistant — dev only)."""
        logger.warning("[PQC/DSA] PLACEHOLDER sign — NOT SECURE")
        import hmac
        key_material = hashlib.sha3_256(signing_key[:32]).digest()
        mac = hmac.new(key_material, message, hashlib.sha3_512)
        return mac.digest()

    def _placeholder_verify(
        self,
        message: bytes,
        signature: bytes,
        verify_key: bytes,
    ) -> bool:
        logger.warning("[PQC/DSA] PLACEHOLDER verify — NOT SECURE")
        import hmac
        # Derive the same key material as sign (DEMO ONLY — uses verify_key as sk proxy)
        key_material = hashlib.sha3_256(verify_key[:32]).digest()
        expected = hmac.new(key_material, message, hashlib.sha3_512).digest()
        return hmac.compare_digest(expected, signature)


def save_dsa_keypair(keypair: DSAKeyPair, name: str = "aegis") -> None:
    os.makedirs(KEY_DIR, exist_ok=True)
    sk_path = os.path.join(KEY_DIR, f"{name}_dsa_sk.bin")
    vk_path = os.path.join(KEY_DIR, f"{name}_dsa_vk.bin")
    with open(vk_path, "wb") as f:
        f.write(keypair.verify_key)

    kek = get_kek()
    if kek:
        from backend.utils.keywrap import encrypt_bytes
        enc = encrypt_bytes(keypair.signing_key, kek)
        with open(sk_path + ".enc", "wb") as f:
            f.write(enc)
        logger.info(f"[PQC/DSA] Private key encrypted to {sk_path}.enc")
    else:
        with open(sk_path, "wb") as f:
            f.write(keypair.signing_key)
        logger.info(f"[PQC/DSA] Private key saved to {sk_path} (unencrypted)")


def load_dsa_keypair(name: str = "aegis") -> DSAKeyPair:
    sk_path = os.path.join(KEY_DIR, f"{name}_dsa_sk.bin")
    sk_enc_path = sk_path + ".enc"
    vk_path = os.path.join(KEY_DIR, f"{name}_dsa_vk.bin")
    with open(vk_path, "rb") as f:
        vk = f.read()

    if os.path.exists(sk_enc_path):
        kek = get_kek()
        if not kek:
            raise FileNotFoundError(f"Encrypted private key found but no KEK available: {sk_enc_path}")
        with open(sk_enc_path, "rb") as f:
            enc = f.read()
        sk = decrypt_bytes(enc, kek)
    else:
        with open(sk_path, "rb") as f:
            sk = f.read()
    return DSAKeyPair(signing_key=sk, verify_key=vk)


# Module-level singleton
_dsa_instance: Optional[MLDSA87] = None


def get_dsa() -> MLDSA87:
    global _dsa_instance
    if _dsa_instance is None:
        _dsa_instance = MLDSA87()
    return _dsa_instance

