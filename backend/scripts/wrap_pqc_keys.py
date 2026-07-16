import os
from backend.utils.keywrap import get_kek, encrypt_file

KEY_DIR = os.getenv('PQC_KEY_DIR', './pqc_keys')

def wrap_existing(name='aegis'):
    kek = get_kek()
    if not kek:
        print('No KEK found in environment or Vault. Set AEGIS_KEK to wrap keys.')
        return
    sk = os.path.join(KEY_DIR, f"{name}_kem_sk.bin")
    sk_enc = sk + '.enc'
    if os.path.exists(sk) and not os.path.exists(sk_enc):
        encrypt_file(sk, sk_enc, kek)
        print(f'Wrapped {sk} -> {sk_enc}')
    else:
        print(f'No unwrapped KEM sk found at {sk} or already wrapped.')

    sk2 = os.path.join(KEY_DIR, f"{name}_dsa_sk.bin")
    sk2_enc = sk2 + '.enc'
    if os.path.exists(sk2) and not os.path.exists(sk2_enc):
        encrypt_file(sk2, sk2_enc, kek)
        print(f'Wrapped {sk2} -> {sk2_enc}')
    else:
        print(f'No unwrapped DSA sk found at {sk2} or already wrapped.')

if __name__ == '__main__':
    wrap_existing()
