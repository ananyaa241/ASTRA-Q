from backend.utils.secret_store import provision_user_totp_secret

DEMO_USERS = {
    'alice': 'base32secret3232',
    'bob_high_risk': 'base32secret3232',
}

def main():
    for u, s in DEMO_USERS.items():
        provision_user_totp_secret(u, s)
        print(f'Provisioned TOTP for {u}')

if __name__ == '__main__':
    main()
