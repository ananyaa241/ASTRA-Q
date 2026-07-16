import os
from typing import Optional
from cryptography.fernet import Fernet
from backend.utils.vault_client import get_secret_kv_v2


def _kek_from_env_or_vault() -> Optional[bytes]:
    """Return a KEK (Fernet key) from env `AEGIS_KEK` or from Vault path `secret/data/aegis/kek` key `kek`."""
    kek = os.getenv('AEGIS_KEK')
    if kek:
        return kek.encode()

    # Try Vault KV v2 path
    try:
        val = get_secret_kv_v2('secret/data/aegis/kek', 'kek')
        if val:
            return val.encode()
    except Exception:
        pass

    return None


def get_kek() -> Optional[bytes]:
    return _kek_from_env_or_vault()


def encrypt_bytes(plaintext: bytes, kek: bytes) -> bytes:
    f = Fernet(kek)
    return f.encrypt(plaintext)


def decrypt_bytes(ciphertext: bytes, kek: bytes) -> bytes:
    f = Fernet(kek)
    return f.decrypt(ciphertext)


def encrypt_file(path_in: str, path_out: str, kek: bytes) -> None:
    with open(path_in, 'rb') as f:
        data = f.read()
    enc = encrypt_bytes(data, kek)
    with open(path_out, 'wb') as f:
        f.write(enc)


def decrypt_file(path_in: str, path_out: str, kek: bytes) -> None:
    with open(path_in, 'rb') as f:
        data = f.read()
    dec = decrypt_bytes(data, kek)
    with open(path_out, 'wb') as f:
        f.write(dec)
