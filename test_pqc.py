import subprocess
import base64
import json
import urllib.request
import time

print("Requesting ML-KEM-1024 mock client public key from within the Docker runtime...")
result = subprocess.run(
    ["docker", "compose", "exec", "backend", "python", "-c", 
     "from backend.pqc.kem import get_kem; pk=get_kem().generate_keypair().public_key; import base64; print(base64.b64encode(pk).decode())"],
    cwd="infra",
    capture_output=True,
    text=True
)

if result.returncode != 0:
    print("Failed to generate client PK:", result.stderr)
    exit(1)

client_pk_b64 = result.stdout.strip()
print(f"Generated Client PK (Base64): {client_pk_b64[:30]}...")

req_body = json.dumps({
    "user_id": "usr_priv_001",
    "client_public_key_b64": client_pk_b64
}).encode("utf-8")

req = urllib.request.Request(
    "http://localhost:8000/api/auth/pqc-handshake",
    data=req_body,
    headers={"Content-Type": "application/json"}
)

print("\nExecuting Privileged PQC Handshake over the wire...")
while True:
    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            print(f"✅ Success! Status: {res_data['status']}")
            print(f"🔒 Ciphertext received (Base64): {res_data['ciphertext_b64'][:40]}...")
            break
    except Exception as e:
        print("Waiting for server ready... ", e)
        time.sleep(10)
