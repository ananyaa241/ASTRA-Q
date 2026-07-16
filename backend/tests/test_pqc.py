"""Test: ML-KEM-1024 + ML-DSA-87 PQC sign/verify roundtrip"""
import base64
import hashlib
import json
import pytest

from backend.pqc.kem import MLKEM1024, KEMKeyPair, EncapsulationResult
from backend.pqc.dsa import MLDSA87, DSAKeyPair, SignedPayload
from backend.pqc.audit_log import PQCAuditLogger, AuditActionType


class TestMLKEM1024:
    """ML-KEM-1024 key encapsulation roundtrip tests."""

    @pytest.fixture
    def kem(self):
        return MLKEM1024()

    def test_keypair_generation(self, kem):
        """Should generate a valid key pair."""
        kp = kem.generate_keypair()
        assert isinstance(kp, KEMKeyPair)
        assert len(kp.public_key) > 0
        assert len(kp.private_key) > 0
        assert len(kp.key_fingerprint) == 64  # SHA3-256 = 32 bytes = 64 hex chars

    def test_keypair_fingerprint_deterministic(self, kem):
        """Same public key should always produce same fingerprint."""
        kp = kem.generate_keypair()
        fp1 = hashlib.sha3_256(kp.public_key).hexdigest()
        fp2 = hashlib.sha3_256(kp.public_key).hexdigest()
        assert fp1 == fp2 == kp.key_fingerprint

    def test_encapsulate_decapsulate_roundtrip(self, kem):
        """Encapsulate + decapsulate should yield the same shared secret."""
        kp = kem.generate_keypair()
        result = kem.encapsulate(kp.public_key)

        assert isinstance(result, EncapsulationResult)
        assert len(result.ciphertext) > 0
        assert len(result.shared_secret) > 0

        recovered = kem.decapsulate(result.ciphertext, kp.private_key)
        assert recovered == result.shared_secret, (
            "Decapsulated secret must match encapsulated secret"
        )

    def test_aes_key_derivation(self, kem):
        """Derived AES key should be 32 bytes and deterministic."""
        kp = kem.generate_keypair()
        result = kem.encapsulate(kp.public_key)
        aes_key = result.derive_aes_key()

        assert len(aes_key) == 32, f"AES key should be 32 bytes, got {len(aes_key)}"
        assert aes_key == result.derive_aes_key(), "Key derivation must be deterministic"

    def test_different_encapsulations_different_secrets(self, kem):
        """Each encapsulation should produce a unique shared secret."""
        kp = kem.generate_keypair()
        r1 = kem.encapsulate(kp.public_key)
        r2 = kem.encapsulate(kp.public_key)
        assert r1.shared_secret != r2.shared_secret, (
            "Each encapsulation should produce a fresh shared secret"
        )

    def test_wrong_private_key_different_secret(self, kem):
        """Decapsulation with wrong private key should yield different secret."""
        kp1 = kem.generate_keypair()
        kp2 = kem.generate_keypair()
        result = kem.encapsulate(kp1.public_key)

        recovered = kem.decapsulate(result.ciphertext, kp2.private_key)
        # Should NOT equal the original (with overwhelming probability)
        assert recovered != result.shared_secret, (
            "Wrong private key should not recover the correct shared secret"
        )


class TestMLDSA87:
    """ML-DSA-87 digital signature tests."""

    @pytest.fixture
    def dsa(self):
        return MLDSA87()

    @pytest.fixture
    def keypair(self, dsa):
        return dsa.generate_keypair()

    def test_keypair_generation(self, dsa):
        kp = dsa.generate_keypair()
        assert isinstance(kp, DSAKeyPair)
        assert len(kp.signing_key) > 0
        assert len(kp.verify_key) > 0
        assert len(kp.key_fingerprint) == 64

    def test_sign_verify_roundtrip(self, dsa, keypair):
        """Sign + verify should succeed for valid message."""
        message = b"Astra-Q threat alert payload v1.0"
        signature = dsa.sign(message, keypair.signing_key)
        assert len(signature) > 0
        is_valid = dsa.verify(message, signature, keypair.verify_key)
        assert is_valid, "Valid signature should verify successfully"

    def test_tampered_message_fails(self, dsa, keypair):
        """Tampered message should fail signature verification."""
        original = b"threat_score=0.92,user=USR1337"
        tampered = b"threat_score=0.12,user=USR1337"  # Score lowered
        sig = dsa.sign(original, keypair.signing_key)
        assert not dsa.verify(tampered, sig, keypair.verify_key), (
            "Tampered message should fail verification"
        )

    def test_wrong_key_fails(self, dsa, keypair):
        """Wrong verify key should fail."""
        other_kp = dsa.generate_keypair()
        message = b"sensitive alert data"
        sig = dsa.sign(message, keypair.signing_key)
        assert not dsa.verify(message, sig, other_kp.verify_key), (
            "Wrong verify key should not validate signature"
        )

    def test_sign_payload_roundtrip(self, dsa, keypair):
        """sign_payload + verify_signed_payload roundtrip."""
        payload = {
            "user_id": "USR0042",
            "threat_score": 0.97,
            "risk_tier": "CRITICAL",
            "scenario": "Keylogger detected",
        }
        signed = dsa.sign_payload(payload, keypair)

        assert isinstance(signed, SignedPayload)
        assert len(signed.signature_b64) > 0
        assert signed.payload_hash  # SHA3-512 hash populated
        assert signed.algorithm == "ML-DSA-87"

        is_valid = dsa.verify_signed_payload(signed, keypair.verify_key)
        assert is_valid, "Signed payload verification failed"

    def test_payload_hash_sha3_512(self, dsa, keypair):
        """Payload hash should be SHA3-512 of canonical JSON."""
        payload = {"key": "value", "score": 0.5}
        signed = dsa.sign_payload(payload, keypair)

        # Recompute expected hash
        canonical = json.dumps(payload, sort_keys=True, default=str).encode("utf-8")
        expected_hash = hashlib.sha3_512(canonical).hexdigest()
        assert signed.payload_hash == expected_hash

    def test_dict_representation(self, dsa, keypair):
        """to_dict() should produce serializable representation."""
        payload = {"alert": "test"}
        signed = dsa.sign_payload(payload, keypair)
        d = signed.to_dict()

        assert "payload" in d
        assert "signature" in d
        assert "payload_hash" in d
        assert "algorithm" in d
        assert d["algorithm"] == "ML-DSA-87"
        # Should be JSON-serializable
        json.dumps(d)


class TestPQCAuditLogger:
    """Audit logger tests (without DB — in-memory only)."""

    @pytest.fixture
    def dsa(self):
        return MLDSA87()

    @pytest.fixture
    def logger_with_keys(self, dsa):
        kp = dsa.generate_keypair()
        audit = PQCAuditLogger(dsa=dsa, keypair=kp)
        return audit, kp

    @pytest.mark.asyncio
    async def test_log_without_db(self, logger_with_keys):
        """Logging without DB should still produce a signed entry."""
        audit, kp = logger_with_keys
        entry = await audit.log(
            action_type=AuditActionType.ALERT_GENERATED,
            actor="SYSTEM",
            payload={"score": 0.95, "tier": "CRITICAL"},
            db=None,
        )
        assert "pqc_signature" in entry
        assert "payload_hash" in entry
        assert entry["action_type"] == "ALERT_GENERATED"
        assert entry["actor"] == "SYSTEM"

    @pytest.mark.asyncio
    async def test_log_alert_convenience(self, logger_with_keys):
        audit, kp = logger_with_keys
        entry = await audit.log_alert(
            user_id="USR0042",
            session_id="session-abc123",
            threat_score=0.97,
            risk_tier="CRITICAL",
        )
        assert entry["target_user"] == "USR0042"
        assert entry["action_type"] == "ALERT_GENERATED"

    def test_verify_entry_valid(self, logger_with_keys, dsa):
        """verify_entry should return True for authentic entries."""
        import asyncio
        audit, kp = logger_with_keys

        entry = asyncio.run(audit.log(
            action_type=AuditActionType.CONTAINMENT_TRIGGERED,
            actor="analyst_007",
            payload={"action": "ISOLATE", "reason": "Critical threat"},
            db=None,
            target_user="USR0099",
        ))

        is_valid = audit.verify_entry(entry, kp.verify_key)
        assert is_valid, "Freshly-created entry should verify successfully"

    def test_tampered_entry_fails_verification(self, logger_with_keys, dsa):
        """Tampered audit entry should fail verification."""
        import asyncio
        audit, kp = logger_with_keys

        entry = asyncio.run(audit.log(
            action_type=AuditActionType.ALERT_DISMISSED,
            actor="analyst_001",
            payload={"reason": "false positive"},
            db=None,
        ))

        # Tamper with the stored payload
        entry["action_payload"] = '{"reason": "legitimate alert"}'  # Changed!

        is_valid = audit.verify_entry(entry, kp.verify_key)
        assert not is_valid, "Tampered entry should fail verification"

