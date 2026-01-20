import uuid
import asyncio
from datetime import datetime
from typing import Dict, Optional, Callable, Awaitable
from ..models import JobStatus


# In-memory job storage
jobs: Dict[str, dict] = {}

# Callback for WebSocket notifications (set by websocket_manager)
_notify_callback: Optional[Callable[[str, str, int, Optional[str], Optional[str], Optional[str]], Awaitable[None]]] = None


def set_notify_callback(callback):
    """Set the async callback for WebSocket notifications."""
    global _notify_callback
    _notify_callback = callback


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
        "message": None,
    }
    return job_id


def update_job(job_id: str, **kwargs):
    """Update job status and metadata, notify WebSocket clients."""
    if job_id not in jobs:
        return

    jobs[job_id].update(kwargs)

    # Notify WebSocket clients asynchronously
    if _notify_callback:
        job = jobs[job_id]
        download_url = f"/api/posters/{job_id}" if job["status"] == JobStatus.COMPLETED else None

        try:
            # Get or create event loop and schedule notification
            try:
                loop = asyncio.get_running_loop()
                asyncio.create_task(_notify_callback(
                    job_id,
                    job["status"],
                    job.get("progress", 0),
                    job.get("message"),
                    job.get("error"),
                    download_url
                ))
            except RuntimeError:
                # No running loop, create one for this call
                asyncio.run(_notify_callback(
                    job_id,
                    job["status"],
                    job.get("progress", 0),
                    job.get("message"),
                    job.get("error"),
                    download_url
                ))
        except Exception as e:
            # Don't let WebSocket errors break job updates
            pass


def get_job(job_id: str) -> Optional[dict]:
    """Retrieve job by ID."""
    return jobs.get(job_id)


def list_jobs() -> list:
    """List all jobs."""
    return list(jobs.values())
