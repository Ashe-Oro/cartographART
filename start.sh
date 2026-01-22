#!/usr/bin/env python3
import os
import sys

port = os.environ.get("PORT", "8000")
print(f"Starting server on port {port}")

# Use exec to replace this process with uvicorn
os.execvp("uvicorn", ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", port])
