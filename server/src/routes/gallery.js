import { Router } from 'express';
import { getRecentPosters, getPosterPath } from '../services/galleryManager.js';

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
 * Serve a gallery poster image directly (supports both user-generated and bundled posters).
 */
galleryRouter.get('/gallery/image/:jobId', (req, res) => {
  const { jobId } = req.params;

  // Find poster file (checks data dir and bundled posters)
  const filePath = getPosterPath(jobId);

  if (!filePath) {
    return res.status(404).json({ detail: 'Poster file not found' });
  }

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(filePath);
});
