import asyncio
from backend.utils.totp_db import init_table, provision_user_totp_db

DEMO_USERS = {
    'alice': 'base32secret3232',
    'bob_high_risk': 'base32secret3232',
}

async def main():
    await init_table()
    for u, s in DEMO_USERS.items():
        await provision_user_totp_db(u, s)
        print(f'Provisioned DB TOTP for {u}')

if __name__ == '__main__':
    asyncio.run(main())
