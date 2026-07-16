from backend.utils.secret_store import provision_user_totp_secret
import asyncio

DEMO_USERS = {
    'alice': 'base32secret3232',
    'bob_high_risk': 'base32secret3232',
}


def main():
    for u, s in DEMO_USERS.items():
        provision_user_totp_secret(u, s)
        print(f'Provisioned file TOTP for {u}')


async def _maybe_provision_db():
    try:
        from backend.utils.totp_db import init_table, provision_user_totp_db
    except Exception:
        return

    await init_table()
    for u, s in DEMO_USERS.items():
        await provision_user_totp_db(u, s)
        print(f'Provisioned DB TOTP for {u}')


if __name__ == '__main__':
    main()
    # Attempt DB provisioning if possible (inside container with KEK/DATABASE_URL)
    try:
        asyncio.run(_maybe_provision_db())
    except Exception:
        pass
