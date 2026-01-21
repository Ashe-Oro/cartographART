import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env') });

// MODE determines which config set to use: 'testnet' or 'mainnet'
const mode = process.env.MODE || 'mainnet';
const isMainnet = mode === 'mainnet';

// Helper to get env var with optional prefix
const getEnv = (key, fallback = '') => {
  if (isMainnet) {
    // Mainnet: use unprefixed or MAINNET_ prefixed
    return process.env[key] || process.env[`MAINNET_${key}`] || fallback;
  } else {
    // Testnet: use TESTNET_ prefixed first, then fall back to unprefixed
    return process.env[`TESTNET_${key}`] || process.env[key] || fallback;
  }
};

export const config = {
  // Mode
  mode,
  isMainnet,

  // x402 Payment Configuration
  payToAddress: isMainnet
    ? getEnv('PAY_TO_ADDRESS')
    : process.env.TESTNET_PAY_TO_ADDRESS || '0x0000000000000000000000000000000000000000',

  // Network: 'base' for mainnet, 'base-sepolia' for testnet
  network: isMainnet
    ? (process.env.X402_NETWORK || 'base')
    : (process.env.TESTNET_X402_NETWORK || 'base-sepolia'),

  // CAIP-2 network identifier
  networkId: isMainnet
    ? (process.env.NETWORK_ID || 'eip155:8453')
    : (process.env.TESTNET_NETWORK_ID || 'eip155:84532'),

  // Facilitator URL
  facilitatorUrl: isMainnet
    ? (process.env.FACILITATOR_URL || 'https://api.cdp.coinbase.com/platform/v2/x402')
    : (process.env.TESTNET_FACILITATOR_URL || 'https://x402.org/facilitator'),

  // CDP API credentials (required for mainnet)
  // Note: .env files store \n as literal characters, so we convert them to actual newlines
  cdpApiKeyId: process.env.CDP_API_KEY_ID,
  cdpApiKeySecret: process.env.CDP_API_KEY_SECRET?.replace(/\\n/g, '\n'),
  cdpWalletSecret: process.env.CDP_WALLET_SECRET,

  // Testnet buyer keys (for testing)
  testnetBuyerPrivateKey: process.env.TESTNET_BUYER_PRIVATE_KEY,
  testnetBuyerPublicKey: process.env.TESTNET_BUYER_PUBLIC_KEY,

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
};

// Log configuration on startup
console.log(`\n=== Server Configuration ===`);
console.log(`Mode: ${config.mode.toUpperCase()}`);
console.log(`Network: ${config.network} (${config.networkId})`);
console.log(`Pay to: ${config.payToAddress || '(not set)'}`);
console.log(`Facilitator: ${config.facilitatorUrl}`);
console.log(`Price: $${config.posterPrice} USDC`);
console.log(`============================\n`);

// Validate required config for mainnet
if (config.isMainnet) {
  if (!config.payToAddress) {
    console.warn('WARNING: PAY_TO_ADDRESS is not set for mainnet!');
  }
  if (!config.cdpApiKeyId || !config.cdpApiKeySecret) {
    console.warn('WARNING: Running on mainnet without CDP API credentials!');
  }
}

// Ensure data directory exists
import { mkdirSync, existsSync } from 'fs';
if (!existsSync(config.dataDir)) {
  mkdirSync(config.dataDir, { recursive: true });
}
