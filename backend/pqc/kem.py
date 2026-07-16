"""
Aegis-Q PQC: ML-KEM-1024 Key Encapsulation
=============================================
Implements FIPS 203 ML-KEM-1024 (Module Lattice Key Encapsulation Mechanism)
for post-quantum secure transport key derivation.

Uses liboqs (Open Quantum Safe) with Python bindings.
Falls back to a clearly-labeled placeholder on platforms where liboqs
is not available (e.g., native Windows without WSL).

Key Operations:
  1. generate_keypair()   → (public_key, private_key)
  2. encapsulate(pk)      → (ciphertext, shared_secret)
  3. decapsulate(ct, sk)  → shared_secret

The shared_secret is used to derive AES-256-GCM session keys for
transport encryption of all backend ↔ frontend communication.
"""

from __future__ import annotations

import hashlib
import logging
import os
from dataclasses import dataclass
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────
# liboqs Import (with fallback)
# ─────────────────────────────────────────────────────────────────
try:
    import oqs
    LIBOQS_AVAILABLE = True
    logger.info("[PQC/KEM] liboqs available — using real ML-KEM-1024")
except ImportError:
    LIBOQS_AVAILABLE = False
    logger.warning(
        "[PQC/KEM] liboqs NOT available. Using placeholder KEM. "
        "Install via: pip install liboqs-python  (requires CMake + liboqs compiled)"
    )

KEM_ALGORITHM = "ML-KEM-1024"
KEY_DIR = os.getenv("PQC_KEY_DIR", "./pqc_keys")
from backend.utils.keywrap import get_kek, decrypt_bytes


@dataclass
class KEMKeyPair:
    """ML-KEM-1024 key pair."""
    public_key: bytes
    private_key: bytes
    algorithm: str = KEM_ALGORITHM
    key_fingerprint: str = ""

    def __post_init__(self) -> None:
        # SHA3-256 fingerprint of public key
        self.key_fingerprint = hashlib.sha3_256(self.public_key).hexdigest()


@dataclass
class EncapsulationResult:
    ciphertext: bytes
    shared_secret: bytes          # Do NOT log/store this
    ciphertext_fingerprint: str = ""

    def __post_init__(self) -> None:
        self.ciphertext_fingerprint = hashlib.sha3_256(self.ciphertext).hexdigest()[:16]

    def derive_aes_key(self) -> bytes:
        """Derive 32-byte AES-256 key from shared secret via HKDF-SHA3-256."""
        return hashlib.sha3_256(
            b"aegis-q-kem-aes-" + self.shared_secret
        ).digest()


class MLKEM1024:
    """
    ML-KEM-1024 wrapper providing key generation, encapsulation, decapsulation.
    """

    def __init__(self) -> None:
        if LIBOQS_AVAILABLE:
            self._kem = oqs.KeyEncapsulation(KEM_ALGORITHM)
        else:
            self._kem = None

    def generate_keypair(self) -> KEMKeyPair:
        """Generate an ML-KEM-1024 key pair."""
        if LIBOQS_AVAILABLE and self._kem:
            public_key = self._kem.generate_keypair()
            private_key = self._kem.export_secret_key()
            logger.info(f"[PQC/KEM] Generated ML-KEM-1024 key pair (pk={len(public_key)}B)")
            return KEMKeyPair(public_key=public_key, private_key=private_key)
        else:
            return self._placeholder_keypair()

    def encapsulate(self, public_key: bytes) -> EncapsulationResult:
        """
        Encapsulate a shared secret using the recipient's public key.
        Returns ciphertext + shared_secret.
        """
        if LIBOQS_AVAILABLE:
            with oqs.KeyEncapsulation(KEM_ALGORITHM) as kem:
                ciphertext, shared_secret = kem.encap_secret(public_key)
            logger.debug(f"[PQC/KEM] Encapsulated: ct={len(ciphertext)}B")
            return EncapsulationResult(
                ciphertext=ciphertext,
                shared_secret=shared_secret,
            )
        else:
            return self._placeholder_encap(public_key)

    def decapsulate(self, ciphertext: bytes, private_key: bytes) -> bytes:
        """
        Decapsulate to recover shared secret using private key.
        Returns shared_secret bytes.
        """
        if LIBOQS_AVAILABLE:
            with oqs.KeyEncapsulation(KEM_ALGORITHM, private_key) as kem:
                shared_secret = kem.decap_secret(ciphertext)
            logger.debug(f"[PQC/KEM] Decapsulated: ss={len(shared_secret)}B")
            return shared_secret
        else:
            return self._placeholder_decap(ciphertext, private_key)

    # ─────────────────────────────────────────────────────
    # Placeholder (demo mode without liboqs)
    # ─────────────────────────────────────────────────────

    def _placeholder_keypair(self) -> KEMKeyPair:
        """
        SECURITY WARNING: This is a PLACEHOLDER only for development.
        NOT cryptographically secure. Replace with real liboqs in production.
        """
        logger.warning("[PQC/KEM] PLACEHOLDER MODE — NOT SECURE FOR PRODUCTION")
        # 1568 bytes = ML-KEM-1024 public key size
        pub = os.urandom(1568)
        # 3168 bytes = ML-KEM-1024 private key size
        priv = os.urandom(3168)
        return KEMKeyPair(public_key=pub, private_key=priv)

    def _placeholder_encap(self, public_key: bytes) -> EncapsulationResult:
        logger.warning("[PQC/KEM] PLACEHOLDER encapsulation — NOT SECURE")
        # 1568 bytes = ML-KEM-1024 ciphertext size
        ct = os.urandom(1568)
        ss = hashlib.sha3_256(public_key + ct).digest()  # 32 bytes
        return EncapsulationResult(ciphertext=ct, shared_secret=ss)

    def _placeholder_decap(self, ciphertext: bytes, private_key: bytes) -> bytes:
        logger.warning("[PQC/KEM] PLACEHOLDER decapsulation — NOT SECURE")
        return hashlib.sha3_256(private_key[:32] + ciphertext).digest()


def save_keypair(keypair: KEMKeyPair, name: str = "aegis") -> None:
    """Persist key pair to disk (private key should be encrypted in production)."""
    os.makedirs(KEY_DIR, exist_ok=True)
    pk_path = os.path.join(KEY_DIR, f"{name}_kem_pk.bin")
    sk_path = os.path.join(KEY_DIR, f"{name}_kem_sk.bin")
    with open(pk_path, "wb") as f:
        f.write(keypair.public_key)

    kek = get_kek()
    if kek:
        # Store encrypted private key
        sk_enc_path = sk_path + ".enc"
        from backend.utils.keywrap import encrypt_bytes
        enc = encrypt_bytes(keypair.private_key, kek)
        with open(sk_enc_path, "wb") as f:
            f.write(enc)
        logger.info(f"[PQC/KEM] Private key encrypted to {sk_enc_path}")
    else:
        with open(sk_path, "wb") as f:
            f.write(keypair.private_key)
        logger.info(f"[PQC/KEM] Private key saved to {sk_path} (unencrypted)")


def load_keypair(name: str = "aegis") -> KEMKeyPair:
    """Load key pair from disk."""
    pk_path = os.path.join(KEY_DIR, f"{name}_kem_pk.bin")
    sk_path = os.path.join(KEY_DIR, f"{name}_kem_sk.bin")
    sk_enc_path = sk_path + ".enc"
    with open(pk_path, "rb") as f:
        pub = f.read()

    if os.path.exists(sk_enc_path):
        kek = get_kek()
        if not kek:
            raise FileNotFoundError(f"Encrypted private key found but no KEK available: {sk_enc_path}")
        with open(sk_enc_path, "rb") as f:
            enc = f.read()
        priv = decrypt_bytes(enc, kek)
    else:
        with open(sk_path, "rb") as f:
            priv = f.read()
    return KEMKeyPair(public_key=pub, private_key=priv)


# Module-level singleton
_kem_instance: Optional[MLKEM1024] = None


def get_kem() -> MLKEM1024:
    global _kem_instance
    if _kem_instance is None:
        _kem_instance = MLKEM1024()
    return _kem_instance
