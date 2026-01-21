import { Router } from 'express';
import { getJob, JobStatus } from '../services/jobManager.js';

export const jobsRouter = Router();

/**
 * GET /api/jobs/:jobId
 * Check the status of a poster generation job.
 */
jobsRouter.get('/jobs/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = getJob(jobId);

  if (!job) {
    return res.status(404).json({ detail: 'Job not found' });
  }

  const response = {
    job_id: job.id,
    status: job.status,
    progress: job.progress || 0,
    message: job.message || null,
    error: job.error || null,
    download_url: job.status === JobStatus.COMPLETED ? `/api/posters/${jobId}` : null,
  };

  res.json(response);
});
