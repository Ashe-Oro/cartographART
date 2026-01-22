#!/usr/bin/env python3
import os
import sys

port = os.environ.get("PORT", "8000")
print(f"Starting server on port {port}")

# Debug: Print PAY_TO_ADDRESS from environment
pay_to = os.environ.get("PAY_TO_ADDRESS", "NOT_SET")
print(f"=== Environment Check ===")
print(f"PAY_TO_ADDRESS from env: {pay_to}")
print(f"X402_NETWORK from env: {os.environ.get('X402_NETWORK', 'NOT_SET')}")
print(f"=========================")

# Use exec to replace this process with uvicorn
os.execvp("uvicorn", ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", port])
