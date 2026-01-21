import { Router } from 'express';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';

export const themesRouter = Router();

/**
 * GET /api/themes
 * List all available poster themes.
 */
themesRouter.get('/themes', (req, res) => {
  try {
    const themesDir = config.themesDir;
    const themeFiles = readdirSync(themesDir)
      .filter(file => file.endsWith('.json'))
      .sort();

    const themes = themeFiles.map(file => {
      const filePath = join(themesDir, file);
      const data = JSON.parse(readFileSync(filePath, 'utf-8'));
      const id = file.replace('.json', '');

      return {
        id,
        name: data.name || id,
        description: data.description || null,
        bg: data.bg || '#FFFFFF',
        text: data.text || '#000000',
      };
    });

    res.json({ themes });
  } catch (error) {
    console.error('Failed to load themes:', error);
    res.status(500).json({ error: 'Failed to load themes' });
  }
});
