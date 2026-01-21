import { Router } from 'express';
import { existsSync } from 'fs';
import { join } from 'path';
import { createJob, getJob, JobStatus } from '../services/jobManager.js';
import { generatePoster } from '../services/posterGenerator.js';
import { config } from '../config.js';

export const postersRouter = Router();

// Valid themes and sizes
const VALID_SIZES = ['auto', 'neighborhood', 'small', 'town', 'city', 'metro', 'region'];

/**
 * POST /api/posters
 * Create a new poster generation job.
 * Protected by x402 payment middleware.
 */
postersRouter.post('/posters', async (req, res) => {
  try {
    const { city, state, country, theme, size, distance } = req.body;

    // Validate required fields
    if (!city || city.length < 1 || city.length > 100) {
      return res.status(422).json({
        detail: [{ type: 'validation_error', loc: ['body', 'city'], msg: 'City is required (1-100 characters)' }],
      });
    }

    if (!country || country.length < 1 || country.length > 100) {
      return res.status(422).json({
        detail: [{ type: 'validation_error', loc: ['body', 'country'], msg: 'Country is required (1-100 characters)' }],
      });
    }

    // Validate theme exists
    const themeFile = join(config.themesDir, `${theme || 'feature_based'}.json`);
    if (!existsSync(themeFile)) {
      return res.status(400).json({ detail: `Theme '${theme}' not found` });
    }

    // Validate size
    const posterSize = size || 'auto';
    if (!VALID_SIZES.includes(posterSize)) {
      return res.status(400).json({ detail: `Invalid size '${size}'. Must be one of: ${VALID_SIZES.join(', ')}` });
    }

    // Validate distance if provided
    if (distance !== undefined && (distance < 1000 || distance > 50000)) {
      return res.status(400).json({ detail: 'Distance must be between 1000 and 50000 meters' });
    }

    // Create job
    const request = {
      city,
      state: state || null,
      country,
      theme: theme || 'feature_based',
      size: posterSize,
      distance: distance || null,
    };

    const jobId = createJob(request);

    // Start poster generation in background
    generatePoster(jobId, request).catch((error) => {
      console.error(`[Job ${jobId}] Generation failed:`, error);
    });

    // Return job info
    res.status(200).json({
      job_id: jobId,
      status: JobStatus.PENDING,
      progress: 0,
      message: 'Poster generation started. Poll /api/jobs/{job_id} for status.',
      error: null,
      download_url: null,
    });
  } catch (error) {
    console.error('Error creating poster:', error);
    res.status(500).json({ detail: 'Internal server error' });
  }
});

/**
 * GET /api/posters/:jobId
 * Download a completed poster image.
 */
postersRouter.get('/posters/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = getJob(jobId);

  if (!job) {
    return res.status(404).json({ detail: 'Job not found' });
  }

  if (job.status !== JobStatus.COMPLETED) {
    return res.status(400).json({ detail: `Poster not ready yet. Status: ${job.status}` });
  }

  const filePath = join(config.dataDir, `${jobId}.png`);
  if (!existsSync(filePath)) {
    return res.status(404).json({ detail: 'Poster file not found' });
  }

  // Generate filename for download
  const request = job.request;
  const citySlug = request.city.toLowerCase().replace(/\s+/g, '_');
  const filename = `${citySlug}_${request.theme}_poster.png`;

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.sendFile(filePath);
});
