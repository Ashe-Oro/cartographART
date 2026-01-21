import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables before importing app
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../../.env') });

import { createApp, config } from './app.js';

const app = createApp();

// Start server
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Network: ${config.network}`);
  console.log(`Pay to: ${config.payToAddress}`);
  console.log(`Facilitator: ${config.facilitatorUrl}`);
});
