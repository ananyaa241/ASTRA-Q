import os
import sys
import shutil

os.environ["PATH"] = r"C:\Users\Sai Ananya\Desktop\Finspark_final\.venv\Scripts;" + os.environ.get("PATH", "")

try:
    shutil.rmtree(r"C:\Users\Sai Ananya\_oqs")
except Exception:
    pass

try:
    import oqs
    print("SUCCESS: oqs imported successfully!")
except Exception as e:
    print(f"FAILED to import oqs: {e}")
