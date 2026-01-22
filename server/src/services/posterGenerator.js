import { spawn } from 'child_process';
import { join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { config } from '../config.js';
import { updateJob, JobStatus } from './jobManager.js';
import { addToGallery } from './galleryManager.js';

/**
 * Load theme information from theme file.
 * @param {string} themeId - The theme ID
 * @returns {Object} Theme info (name, bg, text)
 */
function loadThemeInfo(themeId) {
  try {
    const themeFile = join(config.themesDir, `${themeId}.json`);
    if (existsSync(themeFile)) {
      const data = JSON.parse(readFileSync(themeFile, 'utf-8'));
      return {
        name: data.name || themeId,
        bg: data.bg || '#0a0a0a',
        text: data.text || '#f5f0e8',
      };
    }
  } catch (error) {
    console.error(`Failed to load theme ${themeId}:`, error);
  }
  return { name: themeId, bg: '#0a0a0a', text: '#f5f0e8' };
}

/**
 * Generate a poster using the Python maptoposter script.
 * @param {string} jobId - The job ID
 * @param {Object} request - The poster request
 */
export async function generatePoster(jobId, request) {
  const { city, state, country, theme, size, distance } = request;
  const outputPath = join(config.dataDir, `${jobId}.png`);

  // Build the command arguments
  const args = [
    join(config.maptoposterDir, 'create_map_poster.py'),
    '--city', city,
    '--country', country,
    '--theme', theme || 'feature_based',
    '--output', outputPath,
    '--preview', // Use 72 DPI to reduce memory usage
  ];

  if (state) {
    args.push('--state', state);
  }

  if (size && size !== 'auto') {
    args.push('--size', size);
  } else if (!distance) {
    // Default to 'city' size (12km) to prevent OOM on large metros
    // User can override with explicit size or distance
    args.push('--size', 'city');
  }

  if (distance) {
    args.push('--distance', String(distance));
  }

  // Update job status to processing
  updateJob(jobId, {
    status: JobStatus.PROCESSING,
    progress: 5,
    message: 'Starting poster generation...',
  });

  return new Promise((resolve, reject) => {
    console.log(`[Job ${jobId}] Starting: python3 ${args.join(' ')}`);

    const childProcess = spawn('python3', args, {
      cwd: config.maptoposterDir,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        // Disable tqdm progress bars to get cleaner error output
        TQDM_DISABLE: '1',
      },
    });

    let stderr = '';

    childProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      console.log(`[Job ${jobId}] ${output}`);

      // Parse progress from output
      const progressMatch = output.match(/(\d+)%/);
      if (progressMatch) {
        const progress = parseInt(progressMatch[1], 10);
        updateJob(jobId, { progress });
      }

      // Update message based on output
      if (output.includes('Fetching') || output.includes('Downloading')) {
        updateJob(jobId, {
          progress: 15,
          message: 'Fetching map data from OpenStreetMap...',
        });
      } else if (output.includes('Processing') || output.includes('Building')) {
        updateJob(jobId, {
          progress: 40,
          message: 'Processing map data...',
        });
      } else if (output.includes('Rendering') || output.includes('Drawing')) {
        updateJob(jobId, {
          progress: 70,
          message: 'Rendering poster...',
        });
      } else if (output.includes('Saving') || output.includes('Writing')) {
        updateJob(jobId, {
          progress: 90,
          message: 'Saving poster image...',
        });
      }
    });

    childProcess.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      // Filter out tqdm progress bar noise (contains \r or |)
      if (!text.includes('\r') && !text.includes('|')) {
        console.error(`[Job ${jobId}] stderr: ${text.trim()}`);
      }
    });

    childProcess.on('close', (code) => {
      if (code === 0) {
        console.log(`[Job ${jobId}] Completed successfully`);

        // Add to gallery BEFORE updating job status (which triggers WebSocket)
        if (request.showInGallery !== false) {
          const themeInfo = loadThemeInfo(request.theme || 'feature_based');
          addToGallery(jobId, request, themeInfo);
        }

        updateJob(jobId, {
          status: JobStatus.COMPLETED,
          progress: 100,
          message: 'Poster generated successfully!',
        });

        resolve(outputPath);
      } else {
        // Clean up stderr - remove tqdm progress bars and extract actual error
        const cleanedStderr = stderr
          .split('\n')
          .filter(line => !line.includes('\r') && !line.includes('|') && line.trim())
          .join('\n')
          .trim();

        const errorMsg = cleanedStderr || `Python process exited with code ${code}`;
        console.error(`[Job ${jobId}] Failed with code ${code}: ${errorMsg}`);
        updateJob(jobId, {
          status: JobStatus.FAILED,
          error: errorMsg,
        });
        reject(new Error(errorMsg));
      }
    });

    childProcess.on('error', (error) => {
      console.error(`[Job ${jobId}] Process error:`, error);
      updateJob(jobId, {
        status: JobStatus.FAILED,
        error: error.message,
      });
      reject(error);
    });
  });
}
