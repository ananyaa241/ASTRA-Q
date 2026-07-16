"""Minimal Vault client scaffold for secret retrieval.

This is a lightweight helper used by the app when Vault is available.
It falls back to environment variables when Vault is not configured.

Note: This module is intentionally minimal — it does not add dependencies
unless `requests` is available. For production use, prefer the official
hvac client and robust error handling.
"""
import os
from typing import Optional


def get_vault_addr() -> Optional[str]:
    return os.getenv('VAULT_ADDR')


def get_vault_token() -> Optional[str]:
    return os.getenv('VAULT_TOKEN')


def get_secret_kv_v2(path: str, key: str) -> Optional[str]:
    """Fetch a value from Vault KV v2 at `path`, returning `data['data'][key]`.

    Returns None when Vault is not configured or on failures.
    """
    addr = get_vault_addr()
    token = get_vault_token()
    if not addr or not token:
        return None

    try:
        import requests
    except Exception:
        return None

    url = f"{addr.rstrip('/')}/v1/{path}"
    headers = {"X-Vault-Token": token}
    try:
        r = requests.get(url, headers=headers, timeout=5)
        if r.status_code != 200:
            return None
        payload = r.json()
        # KV v2 returns {data: {data: {...}}}
        data = payload.get('data', {})
        if 'data' in data:
            return data['data'].get(key)
        return data.get(key)
    except Exception:
        return None
