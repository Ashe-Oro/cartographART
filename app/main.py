import asyncio
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from fastapi_x402 import init_x402, PaymentMiddleware

from .routers import themes, jobs, posters, websocket
from .models import HealthResponse
from .services.job_manager import set_notify_callback
from .services.websocket_manager import notify_job_update
from .config import settings


class APIOnlyPaymentMiddleware(BaseHTTPMiddleware):
    """Wrapper that only applies PaymentMiddleware to /api routes."""

    def __init__(self, app, payment_middleware_class):
        super().__init__(app)
        self.payment_middleware = payment_middleware_class(app)

    async def dispatch(self, request: Request, call_next):
        # Only apply payment middleware to /api routes
        if request.url.path.startswith("/api/"):
            return await self.payment_middleware.dispatch(request, call_next)
        return await call_next(request)


app = FastAPI(
    title="City Map Poster Service",
    description="Generate beautiful minimalist map posters for any city. Powered by OpenStreetMap.",
    version="0.1.0",
)

# Initialize x402 payment configuration
init_x402(
    pay_to=settings.pay_to_address,
    network=settings.x402_network,
    facilitator_url=settings.facilitator_url
)

# Add payment middleware (only for /api routes)
app.add_middleware(APIOnlyPaymentMiddleware, payment_middleware_class=PaymentMiddleware)


@app.on_event("startup")
async def startup_event():
    """Register WebSocket callback with access to the main event loop."""
    loop = asyncio.get_running_loop()
    set_notify_callback(notify_job_update, loop)

# Include routers
app.include_router(themes.router)
app.include_router(jobs.router)
app.include_router(posters.router)
app.include_router(websocket.router)

# Mount static files
static_dir = Path(__file__).parent.parent / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint for Railway."""
    return HealthResponse(status="ok")


@app.get("/")
async def root():
    """Serve the frontend."""
    index_path = Path(__file__).parent.parent / "static" / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return {"message": "City Map Poster Service API", "docs": "/docs"}
