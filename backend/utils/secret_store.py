import os
import json
from cryptography.fernet import Fernet
from typing import Optional

# Simple file-backed secret store for demo purposes.
# In production, replace with Vault/Cloud KMS integration.

SECRETS_DIR = os.getenv('AEGIS_SECRETS_DIR', '/app/pqc_keys')
KEK = os.getenv('AEGIS_KEK')

if KEK is None:
    # For local dev only: generate an ephemeral key (not persisted)
    # Logically this should be fatal for production.
    KEK = Fernet.generate_key().decode()

fernet = Fernet(KEK.encode())

async def get_user_totp_secret(user_id: str) -> str:
    """Return the decrypted TOTP secret for a user.
    Raises FileNotFoundError if not provisioned.
    """
    enc_path = os.path.join(SECRETS_DIR, f"{user_id}.totp.enc")
    plain_path = os.path.join(SECRETS_DIR, f"{user_id}.totp")

    # Prefer encrypted file when present
    if os.path.exists(enc_path):
        with open(enc_path, 'rb') as f:
            data = f.read()
        dec = fernet.decrypt(data)
        return dec.decode()

    # Fallback to plaintext TOTP secret for developer convenience
    if os.path.exists(plain_path):
        with open(plain_path, 'r', encoding='utf-8') as f:
            return f.read().strip()

    raise FileNotFoundError(enc_path)


def provision_user_totp_secret(user_id: str, secret: str) -> None:
    """Encrypt and write the user's TOTP secret to disk.
    For demo only; in prod use Vault/KMS.
    """
    os.makedirs(SECRETS_DIR, exist_ok=True)
    path = os.path.join(SECRETS_DIR, f"{user_id}.totp.enc")
    enc = fernet.encrypt(secret.encode())
    with open(path, 'wb') as f:
        f.write(enc)

if __name__ == '__main__':
    # CLI convenience: provision secret
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--user', required=True)
    parser.add_argument('--secret', required=False)
    args = parser.parse_args()
    s = args.secret or input('TOTP secret: ')
    provision_user_totp_secret(args.user, s)
    print('Provisioned')
