import { getJob, setNotifyCallback } from '../services/jobManager.js';

// Track active WebSocket connections by job ID
const connections = new Map();

/**
 * Notify all connected clients about a job update.
 * @param {string} jobId - The job ID
 * @param {Object} update - The update data
 */
function notifyJobUpdate(jobId, update) {
  const jobConnections = connections.get(jobId);
  if (!jobConnections || jobConnections.size === 0) {
    return;
  }

  const message = JSON.stringify({
    type: 'job_update',
    ...update,
  });

  for (const ws of jobConnections) {
    if (ws.readyState === 1) { // OPEN
      ws.send(message);
    }
  }
}

// Set the notification callback for the job manager
setNotifyCallback(notifyJobUpdate);

/**
 * Set up WebSocket routes on the app.
 * @param {Express.Application} app - The Express app with express-ws
 */
export function setupWebSocket(app) {
  /**
   * WebSocket endpoint for job updates.
   * /ws/jobs/:jobId
   */
  app.ws('/ws/jobs/:jobId', (ws, req) => {
    const { jobId } = req.params;
    console.log(`[WebSocket] Client connected for job ${jobId}`);

    // Store connection
    if (!connections.has(jobId)) {
      connections.set(jobId, new Set());
    }
    connections.get(jobId).add(ws);

    // Send current job status immediately
    const job = getJob(jobId);
    if (job) {
      ws.send(JSON.stringify({
        type: 'job_update',
        job_id: jobId,
        status: job.status,
        progress: job.progress,
        message: job.message,
        error: job.error,
        download_url: job.status === 'completed' ? `/api/posters/${jobId}` : null,
      }));
    }

    // Handle client disconnect
    ws.on('close', () => {
      console.log(`[WebSocket] Client disconnected for job ${jobId}`);
      const jobConnections = connections.get(jobId);
      if (jobConnections) {
        jobConnections.delete(ws);
        if (jobConnections.size === 0) {
          connections.delete(jobId);
        }
      }
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error(`[WebSocket] Error for job ${jobId}:`, error);
    });
  });
}
