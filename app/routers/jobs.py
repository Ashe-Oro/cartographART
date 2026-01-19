from fastapi import APIRouter, HTTPException
from ..services.job_manager import get_job
from ..models import JobResponse, JobStatus

router = APIRouter(prefix="/api", tags=["jobs"])


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job_status(job_id: str):
    """Check the status of a poster generation job."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    response = JobResponse(
        job_id=job["id"],
        status=job["status"],
        progress=job.get("progress", 0),
        error=job.get("error"),
    )

    if job["status"] == JobStatus.COMPLETED:
        response.download_url = f"/api/posters/{job_id}"

    return response
