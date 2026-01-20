"""
WebSocket connection manager for real-time job progress updates.
"""

import asyncio
import json
import logging
from typing import Dict, Set
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections for job progress updates."""

    def __init__(self):
        # job_id -> set of connected WebSockets
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, job_id: str):
        """Accept a WebSocket connection and register it for a job."""
        await websocket.accept()
        async with self._lock:
            if job_id not in self.active_connections:
                self.active_connections[job_id] = set()
            self.active_connections[job_id].add(websocket)
        logger.info(f"WebSocket connected for job {job_id}")

    async def disconnect(self, websocket: WebSocket, job_id: str):
        """Remove a WebSocket connection."""
        async with self._lock:
            if job_id in self.active_connections:
                self.active_connections[job_id].discard(websocket)
                if not self.active_connections[job_id]:
                    del self.active_connections[job_id]
        logger.info(f"WebSocket disconnected for job {job_id}")

    async def broadcast_to_job(self, job_id: str, message: dict):
        """Send a message to all connections watching a specific job."""
        async with self._lock:
            connections = self.active_connections.get(job_id, set()).copy()

        if not connections:
            return

        # Send to all connections, removing any that fail
        disconnected = []
        for websocket in connections:
            try:
                await websocket.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send to WebSocket: {e}")
                disconnected.append(websocket)

        # Clean up disconnected sockets
        if disconnected:
            async with self._lock:
                for ws in disconnected:
                    if job_id in self.active_connections:
                        self.active_connections[job_id].discard(ws)


# Global connection manager instance
manager = ConnectionManager()


async def notify_job_update(job_id: str, status: str, progress: int, message: str = None, error: str = None, download_url: str = None):
    """
    Notify all connected clients about a job update.
    Called from job_manager.update_job().
    """
    payload = {
        "type": "job_update",
        "job_id": job_id,
        "status": status,
        "progress": progress,
    }
    if message:
        payload["message"] = message
    if error:
        payload["error"] = error
    if download_url:
        payload["download_url"] = download_url

    await manager.broadcast_to_job(job_id, payload)
