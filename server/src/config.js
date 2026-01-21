import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env') });

// Determine if we're in production (mainnet) or development (testnet)
const isMainnet = process.env.X402_NETWORK === 'base' || process.env.NODE_ENV === 'production';

export const config = {
  // x402 Payment Configuration
  payToAddress: process.env.PAY_TO_ADDRESS || '0x0000000000000000000000000000000000000000',

  // Network: 'base' for mainnet, 'base-sepolia' for testnet
  network: process.env.X402_NETWORK || 'base',

  // CAIP-2 network identifier
  networkId: isMainnet ? 'eip155:8453' : 'eip155:84532',

  // Facilitator URL
  // Mainnet: CDP facilitator (requires API keys)
  // Testnet: x402.org (no API keys needed)
  facilitatorUrl: isMainnet
    ? 'https://api.cdp.coinbase.com/platform/v2/x402'
    : 'https://x402.org/facilitator',

  // CDP API credentials (required for mainnet)
  cdpApiKeyId: process.env.CDP_API_KEY_ID,
  cdpApiKeySecret: process.env.CDP_API_KEY_SECRET,
  cdpWalletSecret: process.env.CDP_WALLET_SECRET,

  // Pricing (in dollars)
  posterPrice: process.env.POSTER_PRICE || '0.75',

  // Storage
  dataDir: process.env.DATA_DIR || join(__dirname, '../../data/posters'),
  cleanupHours: parseInt(process.env.CLEANUP_HOURS || '24', 10),

  // Paths
  maptoposterDir: join(__dirname, '../..'),
  themesDir: join(__dirname, '../../themes'),

  // USDC contract addresses
  usdcAddress: isMainnet
    ? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'  // Base Mainnet
    : '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // Base Sepolia

  // Server
  port: parseInt(process.env.PORT || '8000', 10),

  // Helper to check if mainnet
  isMainnet,
};

// Validate required config for mainnet
if (config.isMainnet) {
  if (!config.cdpApiKeyId || !config.cdpApiKeySecret) {
    console.warn('WARNING: Running on mainnet without CDP API credentials!');
    console.warn('Set CDP_API_KEY_ID and CDP_API_KEY_SECRET for production use.');
  }
}

// Ensure data directory exists
import { mkdirSync, existsSync } from 'fs';
if (!existsSync(config.dataDir)) {
  mkdirSync(config.dataDir, { recursive: true });
}
