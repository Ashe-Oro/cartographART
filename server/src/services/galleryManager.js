import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');
const GALLERY_FILE = join(DATA_DIR, 'gallery.json');
const MAX_ENTRIES = 12;

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Load gallery entries from file.
 * @returns {Array} Gallery entries
 */
export function loadGallery() {
  try {
    if (existsSync(GALLERY_FILE)) {
      const data = JSON.parse(readFileSync(GALLERY_FILE, 'utf-8'));
      return data.entries || [];
    }
  } catch (error) {
    console.error('Failed to load gallery:', error);
  }
  return [];
}

/**
 * Save gallery entries to file.
 * @param {Array} entries - Gallery entries to save
 */
export function saveGallery(entries) {
  try {
    writeFileSync(GALLERY_FILE, JSON.stringify({ entries }, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save gallery:', error);
  }
}

/**
 * Add a poster to the gallery.
 * @param {string} jobId - The job ID
 * @param {Object} request - The poster request
 * @param {Object} themeInfo - Theme information (name, bgColor, textColor)
 */
export function addToGallery(jobId, request, themeInfo = {}) {
  const entries = loadGallery();

  // Create new entry
  const entry = {
    jobId,
    city: request.city,
    state: request.state || null,
    country: request.country,
    theme: request.theme,
    themeName: themeInfo.name || request.theme,
    bgColor: themeInfo.bg || '#0a0a0a',
    textColor: themeInfo.text || '#f5f0e8',
    createdAt: new Date().toISOString(),
  };

  // Add to beginning of array (most recent first)
  entries.unshift(entry);

  // Keep only the most recent entries
  const trimmedEntries = entries.slice(0, MAX_ENTRIES);

  saveGallery(trimmedEntries);
  console.log(`[Gallery] Added poster ${jobId} for ${request.city}, ${request.country}`);

  return entry;
}

/**
 * Get recent posters from the gallery.
 * @param {number} limit - Maximum number of entries to return
 * @returns {Object} Gallery data with entries and total count
 */
export function getRecentPosters(limit = MAX_ENTRIES) {
  const entries = loadGallery();
  return {
    posters: entries.slice(0, limit),
    total: entries.length,
  };
}

/**
 * Remove a poster from the gallery.
 * @param {string} jobId - The job ID to remove
 */
export function removeFromGallery(jobId) {
  const entries = loadGallery();
  const filtered = entries.filter(e => e.jobId !== jobId);

  if (filtered.length !== entries.length) {
    saveGallery(filtered);
    console.log(`[Gallery] Removed poster ${jobId}`);
  }
}
