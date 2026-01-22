import { Router } from 'express';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { getRecentPosters, getPosterPath } from '../services/galleryManager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const THUMBNAIL_DIR = join(__dirname, '../../data/thumbnails');
const THUMBNAIL_HEIGHT = 300; // Height in pixels, width auto-scaled

// Ensure thumbnail directory exists
if (!existsSync(THUMBNAIL_DIR)) {
  mkdirSync(THUMBNAIL_DIR, { recursive: true });
}

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
 * GET /api/gallery/thumbnail/:jobId
 * Serve a small thumbnail for gallery display.
 * Generates and caches thumbnails on first request.
 */
galleryRouter.get('/gallery/thumbnail/:jobId', async (req, res) => {
  const { jobId } = req.params;

  // Check if thumbnail already exists
  const thumbnailPath = join(THUMBNAIL_DIR, `${jobId}.webp`);
  if (existsSync(thumbnailPath)) {
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=604800'); // 7 days
    return res.sendFile(thumbnailPath);
  }

  // Find original poster
  const originalPath = getPosterPath(jobId);
  if (!originalPath) {
    return res.status(404).json({ detail: 'Poster not found' });
  }

  try {
    // Generate thumbnail
    await sharp(originalPath)
      .resize({ height: THUMBNAIL_HEIGHT, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(thumbnailPath);

    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=604800');
    res.sendFile(thumbnailPath);
  } catch (error) {
    console.error('Failed to generate thumbnail:', error);
    // Fall back to serving original
    res.setHeader('Content-Type', 'image/png');
    res.sendFile(originalPath);
  }
});

/**
 * GET /api/gallery/image/:jobId
 * Serve full-resolution gallery poster image (for lightbox/download).
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
