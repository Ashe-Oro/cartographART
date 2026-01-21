import express from 'express';
import cors from 'cors';
import expressWs from 'express-ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

import { setupX402Middleware } from './middleware/x402.js';
import { themesRouter } from './routes/themes.js';
import { jobsRouter } from './routes/jobs.js';
import { postersRouter } from './routes/posters.js';
import { setupWebSocket } from './routes/websocket.js';
import { config } from './config.js';

// Load environment variables
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../../.env') });

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
expressWs(app);

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files
const staticDir = join(__dirname, '../../static');
app.use('/static', express.static(staticDir));

// Health check (no payment required)
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// API routes (themes and jobs don't require payment)
app.use('/api', themesRouter);
app.use('/api', jobsRouter);

// x402 protected routes
setupX402Middleware(app);
app.use('/api', postersRouter);

// WebSocket routes
setupWebSocket(app);

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(join(staticDir, 'index.html'));
});

// Start server
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Network: ${config.network}`);
  console.log(`Pay to: ${config.payToAddress}`);
  console.log(`Facilitator: ${config.facilitatorUrl}`);
});
