import { Router } from 'express';
import { existsSync } from 'fs';
import { join } from 'path';
import { getRecentPosters, loadGallery } from '../services/galleryManager.js';
import { config } from '../config.js';

export const galleryRouter = Router();

/**
 * GET /api/gallery
 * Get recent posters for the public gallery.
 */
galleryRouter.get('/gallery', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 12, 12);
    const gallery = getRecentPosters(limit);

    res.json(gallery);
  } catch (error) {
    console.error('Error fetching gallery:', error);
    res.status(500).json({ detail: 'Failed to fetch gallery' });
  }
});

/**
 * GET /api/gallery/image/:jobId
 * Serve a gallery poster image directly (no job data required).
 */
galleryRouter.get('/gallery/image/:jobId', (req, res) => {
  const { jobId } = req.params;

  // Verify the job is in the gallery
  const entries = loadGallery();
  const entry = entries.find(e => e.jobId === jobId);

  if (!entry) {
    return res.status(404).json({ detail: 'Poster not found in gallery' });
  }

  const filePath = join(config.dataDir, `${jobId}.png`);
  if (!existsSync(filePath)) {
    return res.status(404).json({ detail: 'Poster file not found' });
  }

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(filePath);
});
