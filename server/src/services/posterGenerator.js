import { spawn } from 'child_process';
import { join } from 'path';
import { config } from '../config.js';
import { updateJob, JobStatus } from './jobManager.js';

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
  ];

  if (state) {
    args.push('--state', state);
  }

  if (size && size !== 'auto') {
    args.push('--size', size);
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
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
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
      stderr += data.toString();
      console.error(`[Job ${jobId}] stderr: ${data.toString().trim()}`);
    });

    childProcess.on('close', (code) => {
      if (code === 0) {
        console.log(`[Job ${jobId}] Completed successfully`);
        updateJob(jobId, {
          status: JobStatus.COMPLETED,
          progress: 100,
          message: 'Poster generated successfully!',
        });
        resolve(outputPath);
      } else {
        console.error(`[Job ${jobId}] Failed with code ${code}: ${stderr}`);
        updateJob(jobId, {
          status: JobStatus.FAILED,
          error: stderr || `Process exited with code ${code}`,
        });
        reject(new Error(stderr || `Process exited with code ${code}`));
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
