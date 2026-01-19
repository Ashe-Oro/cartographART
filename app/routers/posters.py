from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse
from ..config import settings
from ..services.job_manager import create_job, get_job
from ..services.poster_generator import generate_poster_task
from ..models import PosterRequest, JobResponse, JobStatus

router = APIRouter(prefix="/api", tags=["posters"])


@router.post("/posters", response_model=JobResponse)
async def create_poster(request: PosterRequest, background_tasks: BackgroundTasks):
    """
    Create a new poster generation job.

    In production, this endpoint will be protected by x402 payment ($0.75 USDC).
    Generation takes 30-60 seconds. Poll /api/jobs/{job_id} for status.
    """
    # Validate theme exists
    themes_dir = settings.maptoposter_dir / "themes"
    if not (themes_dir / f"{request.theme}.json").exists():
        raise HTTPException(status_code=400, detail=f"Theme '{request.theme}' not found")

    job_id = create_job(request)
    background_tasks.add_task(generate_poster_task, job_id, request)

    return JobResponse(
        job_id=job_id,
        status=JobStatus.PENDING,
        message="Poster generation started. Poll /api/jobs/{job_id} for status.",
    )


@router.get("/posters/{job_id}")
async def download_poster(job_id: str):
    """Download a completed poster image."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job["status"] != JobStatus.COMPLETED:
        raise HTTPException(
            status_code=400, detail=f"Poster not ready yet. Status: {job['status']}"
        )

    file_path = settings.data_dir / f"{job_id}.png"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Poster file not found")

    # Generate a nice filename for download
    request = job["request"]
    city_slug = request["city"].lower().replace(" ", "_")
    filename = f"{city_slug}_{request['theme']}_poster.png"

    return FileResponse(path=file_path, media_type="image/png", filename=filename)
