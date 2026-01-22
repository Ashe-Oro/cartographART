import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');
const GALLERY_FILE = join(DATA_DIR, 'gallery.json');
const POSTERS_DIR = join(__dirname, '../../../posters'); // Bundled posters in repo
const MAX_ENTRIES = 12;

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

// Default gallery entries (bundled posters from the repo)
const DEFAULT_POSTERS = [
  {
    jobId: 'san_francisco_sunset_20260108_184122',
    city: 'San Francisco',
    state: 'California',
    country: 'United States',
    theme: 'sunset',
    themeName: 'Sunset',
    bgColor: '#1a0a0a',
    textColor: '#ffd4a3',
    isDefault: true,
  },
  {
    jobId: 'barcelona_warm_beige_20260108_172924',
    city: 'Barcelona',
    state: null,
    country: 'Spain',
    theme: 'warm_beige',
    themeName: 'Warm Beige',
    bgColor: '#f5f0e8',
    textColor: '#2c2416',
    isDefault: true,
  },
  {
    jobId: 'venice_blueprint_20260108_165527',
    city: 'Venice',
    state: null,
    country: 'Italy',
    theme: 'blueprint',
    themeName: 'Blueprint',
    bgColor: '#1e3a5f',
    textColor: '#e8f0f8',
    isDefault: true,
  },
  {
    jobId: 'tokyo_japanese_ink_20260108_165830',
    city: 'Tokyo',
    state: null,
    country: 'Japan',
    theme: 'japanese_ink',
    themeName: 'Japanese Ink',
    bgColor: '#f5f0e8',
    textColor: '#1a1a1a',
    isDefault: true,
  },
  {
    jobId: 'singapore_neon_cyberpunk_20260108_184503',
    city: 'Singapore',
    state: null,
    country: 'Singapore',
    theme: 'neon_cyberpunk',
    themeName: 'Neon Cyberpunk',
    bgColor: '#0a0a12',
    textColor: '#00ffff',
    isDefault: true,
  },
  {
    jobId: 'dubai_midnight_blue_20260108_174920',
    city: 'Dubai',
    state: null,
    country: 'UAE',
    theme: 'midnight_blue',
    themeName: 'Midnight Blue',
    bgColor: '#0a1628',
    textColor: '#d4af37',
    isDefault: true,
  },
];

/**
 * Get the file path for a poster (checks both data dir and bundled posters).
 * @param {string} jobId - The job ID or filename
 * @returns {string|null} The file path or null if not found
 */
export function getPosterPath(jobId) {
  // Check user-generated posters first
  const dataPath = join(DATA_DIR, 'posters', `${jobId}.png`);
  if (existsSync(dataPath)) {
    return dataPath;
  }

  // Check bundled posters (default gallery)
  const bundledPath = join(POSTERS_DIR, `${jobId}.png`);
  if (existsSync(bundledPath)) {
    return bundledPath;
  }

  return null;
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
 * Includes default bundled posters if gallery is empty or to fill remaining slots.
 * @param {number} limit - Maximum number of entries to return
 * @returns {Object} Gallery data with entries and total count
 */
export function getRecentPosters(limit = MAX_ENTRIES) {
  const userEntries = loadGallery();

  // Combine user entries with defaults (user entries first)
  const combined = [...userEntries];

  // Add default posters to fill remaining slots
  const remaining = limit - combined.length;
  if (remaining > 0) {
    const defaultsToAdd = DEFAULT_POSTERS.slice(0, remaining);
    combined.push(...defaultsToAdd);
  }

  return {
    posters: combined.slice(0, limit),
    total: combined.length,
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
