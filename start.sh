#!/usr/bin/env python3
import os
import sys

port = os.environ.get("PORT", "8000")

# Debug: Print RAW environment variables (flush immediately)
pay_to = os.environ.get("PAY_TO_ADDRESS", "NOT_SET_IN_ENV")
print(f"[STARTUP] PAY_TO_ADDRESS raw env = {pay_to}", flush=True)
print(f"[STARTUP] X402_NETWORK raw env = {os.environ.get('X402_NETWORK', 'NOT_SET')}", flush=True)
print(f"[STARTUP] Starting server on port {port}", flush=True)

# Use exec to replace this process with uvicorn
os.execvp("uvicorn", ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", port])
