/**
 * Create a CDP Server Wallet for receiving x402 payments.
 *
 * This script creates an EVM account using the Coinbase Developer Platform.
 * The account can be used as the PAY_TO_ADDRESS for receiving USDC payments.
 *
 * Prerequisites:
 * - CDP_API_KEY_ID and CDP_API_KEY_SECRET set in .env
 * - CDP_WALLET_SECRET set in .env
 *
 * Usage: node scripts/create-cdp-wallet.js
 */

import { CdpClient } from '@coinbase/cdp-sdk';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env') });

// Convert \n escape sequences to actual newlines
const apiKeySecret = process.env.CDP_API_KEY_SECRET?.replace(/\\n/g, '\n');

async function main() {
  console.log('Creating CDP Server Wallet...\n');

  // Validate credentials
  if (!process.env.CDP_API_KEY_ID) {
    console.error('Error: CDP_API_KEY_ID is not set in .env');
    process.exit(1);
  }
  if (!apiKeySecret) {
    console.error('Error: CDP_API_KEY_SECRET is not set in .env');
    process.exit(1);
  }
  if (!process.env.CDP_WALLET_SECRET) {
    console.error('Error: CDP_WALLET_SECRET is not set in .env');
    process.exit(1);
  }

  console.log('CDP API Key ID:', process.env.CDP_API_KEY_ID.substring(0, 50) + '...');

  try {
    // Initialize CDP client
    const cdp = new CdpClient({
      apiKeyId: process.env.CDP_API_KEY_ID,
      apiKeySecret: apiKeySecret,
      walletSecret: process.env.CDP_WALLET_SECRET,
    });

    // Create an EVM account
    console.log('\nCreating EVM account...');
    const account = await cdp.evm.createAccount();

    console.log('\n=== CDP Server Wallet Created ===');
    console.log(`Address: ${account.address}`);
    console.log('================================\n');

    console.log('Add this to your .env file:');
    console.log(`PAY_TO_ADDRESS=${account.address}\n`);

    console.log('This wallet can receive USDC payments on Base mainnet.');
    console.log('Make sure to fund it with some ETH for gas if you need to withdraw funds.');

  } catch (error) {
    console.error('Failed to create CDP wallet:', error.message);
    if (error.cause) {
      console.error('Cause:', error.cause);
    }
    process.exit(1);
  }
}

main();
