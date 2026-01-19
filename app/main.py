from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

from .routers import themes, jobs, posters
from .models import HealthResponse

app = FastAPI(
    title="City Map Poster Service",
    description="Generate beautiful minimalist map posters for any city. Powered by OpenStreetMap.",
    version="0.1.0",
)

# Include routers
app.include_router(themes.router)
app.include_router(jobs.router)
app.include_router(posters.router)

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
