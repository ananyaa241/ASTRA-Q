import urllib.request
import time
import json
import urllib.error

data = json.dumps({"user_id": "usr0001", "password": "any", "totp_code": None}).encode("utf-8")
req = urllib.request.Request(
    "http://localhost:8000/api/auth/request-access", 
    data=data, 
    headers={"Content-Type": "application/json"}
)

print("Starting to poll gateway...")
for i in range(120):  # Wait up to 10 minutes total (120 * 5)
    try:
        with urllib.request.urlopen(req) as response:
            print(f"Success ({response.code}):", response.read().decode("utf-8"))
            break
    except urllib.error.HTTPError as e:
        print(f"Trace {i}: HTTPError", e.code)
    except Exception as e:
        pass
    time.sleep(5)
else:
    print("Failed: Server never returned a successful response.")
