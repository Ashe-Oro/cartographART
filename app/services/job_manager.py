import uuid
from datetime import datetime
from typing import Dict, Optional
from ..models import JobStatus


# In-memory job storage
jobs: Dict[str, dict] = {}


def create_job(request) -> str:
    """Create a new job and return its ID."""
    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "id": job_id,
        "status": JobStatus.PENDING,
        "request": request.model_dump(),
        "created_at": datetime.utcnow().isoformat(),
        "completed_at": None,
        "result_file": None,
        "error": None,
        "progress": 0,
    }
    return job_id


def update_job(job_id: str, **kwargs):
    """Update job status and metadata."""
    if job_id in jobs:
        jobs[job_id].update(kwargs)


def get_job(job_id: str) -> Optional[dict]:
    """Retrieve job by ID."""
    return jobs.get(job_id)


def list_jobs() -> list:
    """List all jobs."""
    return list(jobs.values())
