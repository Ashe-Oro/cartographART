"""
WebSocket endpoint for real-time job progress updates.
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from ..services.websocket_manager import manager
from ..services.job_manager import get_job
from ..models import JobStatus

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/jobs/{job_id}")
async def websocket_job_status(websocket: WebSocket, job_id: str):
    """
    WebSocket endpoint for real-time job status updates.

    Connect to this endpoint after creating a job to receive
    real-time progress updates instead of polling.

    Messages sent to client:
    {
        "type": "job_update",
        "job_id": "...",
        "status": "pending|processing|completed|failed",
        "progress": 0-100,
        "message": "...",  # optional
        "error": "...",    # optional, on failure
        "download_url": "..."  # optional, on completion
    }
    """
    # Check if job exists
    job = get_job(job_id)
    if not job:
        await websocket.close(code=4004, reason="Job not found")
        return

    await manager.connect(websocket, job_id)

    try:
        # Send current job status immediately
        initial_status = {
            "type": "job_update",
            "job_id": job_id,
            "status": job["status"],
            "progress": job.get("progress", 0),
        }
        if job["status"] == JobStatus.COMPLETED:
            initial_status["download_url"] = f"/api/posters/{job_id}"
        if job.get("error"):
            initial_status["error"] = job["error"]

        await websocket.send_json(initial_status)

        # Keep connection alive and wait for messages (heartbeat)
        while True:
            # Wait for any message from client (ping/pong or close)
            data = await websocket.receive_text()
            # Client can send "ping" to keep connection alive
            if data == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(websocket, job_id)
