/**
 * End-to-end test for the x402 mainnet payment flow.
 *
 * This script tests the complete payment flow:
 * 1. Request poster creation (get 402 response)
 * 2. Parse payment requirements
 * 3. Sign payment authorization with EIP-712
 * 4. Submit payment and verify success
 *
 * Prerequisites:
 * - Server running in mainnet mode: MODE=mainnet npm start
 * - BUYER_PRIVATE_KEY set in .env (wallet with USDC on Base mainnet)
 * - Sufficient USDC balance in buyer wallet
 *
 * Usage: npm run test:e2e
 */

import { createWalletClient, http, parseUnits, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env') });

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:8000';
const MODE = process.env.MODE || 'mainnet';
const BUYER_PRIVATE_KEY = MODE === 'mainnet'
  ? process.env.BUYER_PRIVATE_KEY
  : process.env.TESTNET_BUYER_PRIVATE_KEY;

// USDC contract addresses
const USDC_ADDRESSES = {
  'eip155:8453': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',  // Base Mainnet
  'eip155:84532': '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // Base Sepolia
};

// Chain configs
const CHAINS = {
  'eip155:8453': base,
  'eip155:84532': baseSepolia,
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
  log(`\n[${step}] ${message}`, 'cyan');
}

function logSuccess(message) {
  log(`✓ ${message}`, 'green');
}

function logError(message) {
  log(`✗ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠ ${message}`, 'yellow');
}

/**
 * Step 1: Request poster creation and get 402 response
 */
async function getPaymentRequirements() {
  logStep('1', 'Requesting poster creation...');

  const response = await fetch(`${SERVER_URL}/api/posters`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      city: 'San Francisco',
      country: 'USA',
      theme: 'blueprint',
      size: 'auto',
    }),
  });

  if (response.status !== 402) {
    throw new Error(`Expected 402 Payment Required, got ${response.status}`);
  }

  logSuccess('Received 402 Payment Required response');

  // Parse payment requirements from header
  const paymentHeader = response.headers.get('PAYMENT-REQUIRED');
  if (!paymentHeader) {
    throw new Error('Missing PAYMENT-REQUIRED header');
  }

  const requirements = JSON.parse(Buffer.from(paymentHeader, 'base64').toString());
  log(`  x402 Version: ${requirements.x402Version}`);
  log(`  Resource: ${requirements.resource?.url}`);

  const scheme = requirements.accepts[0];
  log(`  Scheme: ${scheme.scheme}`);
  log(`  Network: ${scheme.network}`);
  log(`  Amount: ${scheme.amount} (${parseInt(scheme.amount) / 1e6} USDC)`);
  log(`  Pay To: ${scheme.payTo}`);
  log(`  Asset: ${scheme.asset}`);

  return { requirements, scheme };
}

/**
 * Step 2: Create EIP-712 signature for TransferWithAuthorization
 */
async function signPayment(scheme) {
  logStep('2', 'Signing payment authorization...');

  if (!BUYER_PRIVATE_KEY) {
    throw new Error('BUYER_PRIVATE_KEY not set in .env');
  }

  // Add 0x prefix if missing
  const privateKey = BUYER_PRIVATE_KEY.startsWith('0x')
    ? BUYER_PRIVATE_KEY
    : `0x${BUYER_PRIVATE_KEY}`;

  const account = privateKeyToAccount(privateKey);
  log(`  Buyer address: ${account.address}`);

  const chain = CHAINS[scheme.network];
  if (!chain) {
    throw new Error(`Unsupported network: ${scheme.network}`);
  }

  const client = createWalletClient({
    account,
    chain,
    transport: http(),
  });

  // EIP-712 domain for USDC
  const domain = {
    name: scheme.extra?.name || 'USD Coin',
    version: scheme.extra?.version || '2',
    chainId: chain.id,
    verifyingContract: scheme.asset,
  };

  // Generate nonce
  const nonce = '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Validity window (5 minutes)
  const now = Math.floor(Date.now() / 1000);
  const validAfter = now - 60;
  const validBefore = now + (scheme.maxTimeoutSeconds || 300);

  // EIP-3009 TransferWithAuthorization types
  const types = {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
    ],
  };

  // Message to sign
  const message = {
    from: account.address,
    to: scheme.payTo,
    value: BigInt(scheme.amount),
    validAfter: BigInt(validAfter),
    validBefore: BigInt(validBefore),
    nonce,
  };

  log(`  Signing TransferWithAuthorization...`);
  log(`    From: ${message.from}`);
  log(`    To: ${message.to}`);
  log(`    Value: ${message.value.toString()}`);
  log(`    Valid After: ${message.validAfter.toString()}`);
  log(`    Valid Before: ${message.validBefore.toString()}`);

  const signature = await client.signTypedData({
    domain,
    types,
    primaryType: 'TransferWithAuthorization',
    message,
  });

  logSuccess('Payment authorization signed');

  return {
    signature,
    authorization: {
      from: account.address,
      to: scheme.payTo,
      value: scheme.amount,
      validAfter: validAfter.toString(),
      validBefore: validBefore.toString(),
      nonce,
    },
    eip712Domain: domain,
  };
}

/**
 * Step 3: Submit payment and create poster
 */
async function submitPayment(requirements, scheme, paymentData) {
  logStep('3', 'Submitting payment...');

  // Build x402 v2 payment payload (matching the exact schema expected)
  const paymentPayload = {
    x402Version: 2,
    resource: requirements.resource,
    accepted: {
      scheme: scheme.scheme,
      network: scheme.network,
      amount: scheme.amount,
      asset: scheme.asset,
      payTo: scheme.payTo,
      maxTimeoutSeconds: scheme.maxTimeoutSeconds,
      extra: scheme.extra || {},
    },
    payload: {
      signature: paymentData.signature,
      authorization: {
        from: paymentData.authorization.from,
        to: paymentData.authorization.to,
        value: paymentData.authorization.value,
        validAfter: paymentData.authorization.validAfter,
        validBefore: paymentData.authorization.validBefore,
        nonce: paymentData.authorization.nonce,
      },
      eip712Domain: {
        name: paymentData.eip712Domain.name,
        version: paymentData.eip712Domain.version,
        chainId: paymentData.eip712Domain.chainId,
        verifyingContract: paymentData.eip712Domain.verifyingContract,
      },
    },
  };

  const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');

  log(`  Sending request with PAYMENT-SIGNATURE header...`);

  const response = await fetch(`${SERVER_URL}/api/posters`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'PAYMENT-SIGNATURE': paymentHeader,
    },
    body: JSON.stringify({
      city: 'San Francisco',
      country: 'USA',
      theme: 'blueprint',
      size: 'auto',
    }),
  });

  const responseText = await response.text();
  let responseData;
  try {
    responseData = JSON.parse(responseText);
  } catch {
    responseData = responseText;
  }

  if (response.status === 200) {
    logSuccess(`Payment accepted! Status: ${response.status}`);
    log(`  Job ID: ${responseData.job_id}`);
    log(`  Status: ${responseData.status}`);
    return { success: true, data: responseData };
  } else if (response.status === 402) {
    logError(`Payment rejected with 402`);

    // Check for error details
    const errorHeader = response.headers.get('PAYMENT-REQUIRED');
    if (errorHeader) {
      try {
        const errorData = JSON.parse(Buffer.from(errorHeader, 'base64').toString());
        log(`  Error: ${errorData.error || 'Unknown'}`);
      } catch {
        // Ignore parse errors
      }
    }

    return { success: false, status: 402, data: responseData };
  } else {
    logError(`Unexpected response: ${response.status}`);
    log(`  Response: ${JSON.stringify(responseData, null, 2)}`);
    return { success: false, status: response.status, data: responseData };
  }
}

/**
 * Main test runner
 */
async function runTest() {
  console.log('\n' + '='.repeat(60));
  log('x402 End-to-End Payment Test', 'blue');
  console.log('='.repeat(60));

  log(`\nConfiguration:`);
  log(`  Server: ${SERVER_URL}`);
  log(`  Mode: ${MODE}`);
  log(`  Buyer Key: ${BUYER_PRIVATE_KEY ? '***' + BUYER_PRIVATE_KEY.slice(-8) : 'NOT SET'}`);

  if (!BUYER_PRIVATE_KEY) {
    logError('\nBUYER_PRIVATE_KEY is not set. Cannot run e2e test.');
    logWarning('Set BUYER_PRIVATE_KEY in .env for mainnet or TESTNET_BUYER_PRIVATE_KEY for testnet');
    process.exit(1);
  }

  try {
    // Step 1: Get payment requirements
    const { requirements, scheme } = await getPaymentRequirements();

    // Step 2: Sign payment
    const paymentData = await signPayment(scheme);

    // Step 3: Submit payment
    const result = await submitPayment(requirements, scheme, paymentData);

    console.log('\n' + '='.repeat(60));
    if (result.success) {
      logSuccess('END-TO-END TEST PASSED');
      log(`\nThe payment was successfully processed.`);
      log(`Job ID: ${result.data.job_id}`);
      log(`\nYou can check the job status at:`);
      log(`  ${SERVER_URL}/api/jobs/${result.data.job_id}`);
    } else {
      logError('END-TO-END TEST FAILED');
      log(`\nThe payment was not accepted.`);
      log(`Status: ${result.status}`);

      if (result.status === 402) {
        logWarning('\nPossible reasons:');
        logWarning('  - Insufficient USDC balance');
        logWarning('  - Invalid signature');
        logWarning('  - Facilitator validation failed');
        logWarning('  - Network mismatch');
      }
    }
    console.log('='.repeat(60) + '\n');

    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.log('\n' + '='.repeat(60));
    logError('TEST ERROR');
    log(`\n${error.message}`);
    if (error.stack) {
      log(`\nStack trace:\n${error.stack}`, 'yellow');
    }
    console.log('='.repeat(60) + '\n');
    process.exit(1);
  }
}

// Check if server is running
async function checkServer() {
  try {
    const response = await fetch(`${SERVER_URL}/health`);
    if (response.status !== 200) {
      throw new Error(`Health check failed: ${response.status}`);
    }
    return true;
  } catch (error) {
    logError(`Cannot connect to server at ${SERVER_URL}`);
    logWarning('Make sure the server is running:');
    logWarning(`  MODE=${MODE} npm start`);
    process.exit(1);
  }
}

// Run
await checkServer();
await runTest();
