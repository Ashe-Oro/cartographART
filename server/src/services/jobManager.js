import { v4 as uuidv4 } from 'uuid';

// In-memory job storage (use Redis for production)
const jobs = new Map();

// Callback for WebSocket notifications
let notifyCallback = null;

export const JobStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

/**
 * Create a new job.
 * @param {Object} request - The poster request
 * @returns {string} The job ID
 */
export function createJob(request) {
  const jobId = uuidv4();
  const job = {
    id: jobId,
    status: JobStatus.PENDING,
    progress: 0,
    message: null,
    error: null,
    request,
    createdAt: new Date().toISOString(),
  };

  jobs.set(jobId, job);
  return jobId;
}

/**
 * Get a job by ID.
 * @param {string} jobId - The job ID
 * @returns {Object|null} The job or null if not found
 */
export function getJob(jobId) {
  return jobs.get(jobId) || null;
}

/**
 * Update a job's status.
 * @param {string} jobId - The job ID
 * @param {Object} updates - The updates to apply
 */
export function updateJob(jobId, updates) {
  const job = jobs.get(jobId);
  if (!job) return;

  Object.assign(job, updates);

  // Notify via WebSocket if callback is set
  if (notifyCallback) {
    notifyCallback(jobId, {
      job_id: jobId,
      status: job.status,
      progress: job.progress,
      message: job.message,
      error: job.error,
      download_url: job.status === JobStatus.COMPLETED ? `/api/posters/${jobId}` : null,
    });
  }
}

/**
 * Set the notification callback for WebSocket updates.
 * @param {Function} callback - The callback function
 */
export function setNotifyCallback(callback) {
  notifyCallback = callback;
}

/**
 * Get all jobs (for debugging).
 * @returns {Array} All jobs
 */
export function getAllJobs() {
  return Array.from(jobs.values());
}

/**
 * Delete a job.
 * @param {string} jobId - The job ID
 */
export function deleteJob(jobId) {
  jobs.delete(jobId);
}
