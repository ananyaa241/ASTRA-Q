import os
import asyncpg
from typing import Optional
from backend.utils.keywrap import get_kek, encrypt_bytes, decrypt_bytes

DATABASE_URL = os.getenv('DATABASE_URL')


async def _connect():
    if not DATABASE_URL:
        raise RuntimeError('DATABASE_URL not set')
    # asyncpg expects a DSN like postgresql://user:pass@host:port/db
    dsn = DATABASE_URL
    if dsn.startswith('postgresql+asyncpg://'):
        dsn = dsn.replace('postgresql+asyncpg://', 'postgresql://', 1)
    return await asyncpg.connect(dsn)


async def init_table():
    conn = await _connect()
    try:
        await conn.execute(
            'CREATE TABLE IF NOT EXISTS user_totp (user_id TEXT PRIMARY KEY, secret_enc BYTEA)'
        )
    finally:
        await conn.close()


async def provision_user_totp_db(user_id: str, secret: str) -> None:
    kek = get_kek()
    if not kek:
        raise RuntimeError('No KEK available for encrypting TOTP secret')
    enc = encrypt_bytes(secret.encode(), kek)
    conn = await _connect()
    try:
        await conn.execute(
            'INSERT INTO user_totp(user_id, secret_enc) VALUES($1, $2) ON CONFLICT (user_id) DO UPDATE SET secret_enc=EXCLUDED.secret_enc',
            user_id,
            enc,
        )
    finally:
        await conn.close()


async def get_user_totp_secret_db(user_id: str) -> Optional[str]:
    conn = await _connect()
    try:
        row = await conn.fetchrow('SELECT secret_enc FROM user_totp WHERE user_id=$1', user_id)
        if not row:
            return None
        enc = row['secret_enc']
        kek = get_kek()
        if not kek:
            raise RuntimeError('Encrypted TOTP found but KEK not available')
        dec = decrypt_bytes(enc, kek)
        return dec.decode()
    finally:
        await conn.close()
