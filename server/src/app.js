/**
 * Express app factory for testing and production.
 * Separates app creation from server startup for testability.
 */

import express from 'express';
import cors from 'cors';
import expressWs from 'express-ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { setupX402Middleware } from './middleware/x402.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { rateLimit, rateLimitHeaders } from './middleware/rateLimit.js';
import { themesRouter } from './routes/themes.js';
import { jobsRouter } from './routes/jobs.js';
import { postersRouter } from './routes/posters.js';
import { galleryRouter } from './routes/gallery.js';
import { setupWebSocket } from './routes/websocket.js';
import { config } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Create and configure the Express application.
 * @param {Object} options - Configuration options
 * @param {boolean} options.enableWebSocket - Whether to enable WebSocket support
 * @returns {express.Application} Configured Express app
 */
export function createApp(options = {}) {
  const { enableWebSocket = true } = options;

  const app = express();

  if (enableWebSocket) {
    expressWs(app);
  }

  // Middleware
  // CORS must expose x402 headers for the payment flow to work
  app.use(cors({
    exposedHeaders: ['PAYMENT-REQUIRED', 'PAYMENT-RESPONSE', 'X-PAYMENT']
  }));
  app.use(express.json());

  // Serve static files
  const staticDir = join(__dirname, '../../static');
  const rootDir = join(__dirname, '../..');
  app.use('/static', express.static(staticDir));

  // Serve well-known files at root for discoverability
  app.get('/robots.txt', (req, res) => {
    res.sendFile(join(staticDir, 'robots.txt'));
  });
  // Health check (no payment required)
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // OpenAPI specification
  app.get('/api/openapi.json', (req, res) => {
    res.sendFile(join(staticDir, 'openapi.json'));
  });
  app.get('/openapi.json', (req, res) => {
    res.sendFile(join(staticDir, 'openapi.json'));
  });

  // x402 discovery endpoint
  app.get('/.well-known/x402', (req, res) => {
    res.json({
      version: '1.0',
      endpoints: [
        {
          path: '/api/posters',
          method: 'POST',
          description: 'Generate a custom city map poster',
          price: {
            amount: config.posterPrice,
            currency: 'USDC',
            network: config.network,
            chainId: config.networkId === 'base-mainnet' ? 8453 : 84532
          },
          accepts: [{
            scheme: 'exact',
            network: config.networkId,
            asset: 'USDC'
          }]
        }
      ],
      documentation: {
        homepage: '/index.html.md',
        openapi: '/openapi.json',
        protocol: 'https://x402.org'
      }
    });
  });

  // Solana RPC proxy - forwards JSON-RPC requests to mainnet Solana RPC
  // (api.mainnet-beta.solana.com blocks browser requests with 403)
  app.post('/api/solana-rpc', async (req, res) => {
    try {
      const response = await fetch('https://api.mainnet-beta.solana.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body)
      });
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error('[solana-rpc] Proxy error:', error.message);
      res.status(502).json({ error: 'RPC proxy error' });
    }
  });

  // API routes (themes, jobs, and gallery don't require payment)
  // Apply rate limiting to API endpoints
  app.use('/api', rateLimitHeaders('api'));
  app.use('/api', themesRouter);
  app.use('/api', jobsRouter);
  app.use('/api', galleryRouter);

  // x402 protected routes (rate limited separately)
  setupX402Middleware(app);
  app.use('/api/posters', rateLimit('posters'));
  app.use('/api', postersRouter);

  // WebSocket routes
  if (enableWebSocket) {
    setupWebSocket(app);
  }

  // Serve frontend
  app.get('/', (req, res) => {
    res.sendFile(join(staticDir, 'index.html'));
  });

  // Markdown version of homepage (per llmstxt.org spec)
  app.get('/index.html.md', (req, res) => {
    res.type('text/markdown').sendFile(join(staticDir, 'index.html.md'));
  });

  // Error handling (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export { config };
