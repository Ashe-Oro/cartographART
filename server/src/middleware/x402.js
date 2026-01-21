import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { generateJwt } from '@coinbase/cdp-sdk/auth';
import { config } from '../config.js';

// Debug flag - set to true to see detailed facilitator logs
const DEBUG_X402 = true;

/**
 * Create auth headers generator function for CDP facilitator.
 * The x402 HTTPFacilitatorClient expects a createAuthHeaders function
 * that returns headers for verify, settle, and supported endpoints.
 */
function createCdpAuthHeadersGenerator() {
  const facilitatorHost = new URL(config.facilitatorUrl).host;
  const basePath = new URL(config.facilitatorUrl).pathname;

  return async () => {
    // Generate JWTs for each endpoint
    const [verifyJwt, settleJwt, supportedJwt] = await Promise.all([
      generateJwt({
        apiKeyId: config.cdpApiKeyId,
        apiKeySecret: config.cdpApiKeySecret,
        requestMethod: 'POST',
        requestHost: facilitatorHost,
        requestPath: `${basePath}/verify`,
      }),
      generateJwt({
        apiKeyId: config.cdpApiKeyId,
        apiKeySecret: config.cdpApiKeySecret,
        requestMethod: 'POST',
        requestHost: facilitatorHost,
        requestPath: `${basePath}/settle`,
      }),
      generateJwt({
        apiKeyId: config.cdpApiKeyId,
        apiKeySecret: config.cdpApiKeySecret,
        requestMethod: 'GET',
        requestHost: facilitatorHost,
        requestPath: `${basePath}/supported`,
      }),
    ]);

    return {
      verify: { 'Authorization': `Bearer ${verifyJwt}` },
      settle: { 'Authorization': `Bearer ${settleJwt}` },
      supported: { 'Authorization': `Bearer ${supportedJwt}` },
    };
  };
}

/**
 * Set up x402 payment middleware for the Express app.
 * Protects the POST /api/posters endpoint with USDC payment.
 */
export function setupX402Middleware(app) {
  // Create facilitator client options
  const facilitatorOptions = {
    url: config.facilitatorUrl,
  };

  // For mainnet CDP facilitator, use authenticated headers
  if (config.isMainnet && config.cdpApiKeyId && config.cdpApiKeySecret) {
    facilitatorOptions.createAuthHeaders = createCdpAuthHeadersGenerator();
  }

  let facilitatorClient = new HTTPFacilitatorClient(facilitatorOptions);

  // Wrap facilitator client with logging in debug mode
  if (DEBUG_X402) {
    const originalVerify = facilitatorClient.verify.bind(facilitatorClient);
    facilitatorClient.verify = async (...args) => {
      console.log('[x402 DEBUG] Calling facilitator.verify with:', JSON.stringify(args, null, 2));
      try {
        const result = await originalVerify(...args);
        console.log('[x402 DEBUG] Facilitator.verify result:', JSON.stringify(result, null, 2));
        return result;
      } catch (err) {
        console.error('[x402 DEBUG] Facilitator.verify error:', err.message);
        console.error('[x402 DEBUG] Error details:', err);
        throw err;
      }
    };

    const originalSettle = facilitatorClient.settle.bind(facilitatorClient);
    facilitatorClient.settle = async (...args) => {
      console.log('[x402 DEBUG] Calling facilitator.settle with:', JSON.stringify(args, null, 2));
      try {
        const result = await originalSettle(...args);
        console.log('[x402 DEBUG] Facilitator.settle result:', JSON.stringify(result, null, 2));
        return result;
      } catch (err) {
        console.error('[x402 DEBUG] Facilitator.settle error:', err.message);
        console.error('[x402 DEBUG] Error details:', err);
        throw err;
      }
    };
  }

  // Create x402 resource server with EVM scheme support
  const server = new x402ResourceServer(facilitatorClient)
    .register(config.networkId, new ExactEvmScheme());

  // Define payment requirements for protected endpoints
  const paymentConfig = {
    'POST /api/posters': {
      accepts: [
        {
          scheme: 'exact',
          price: `$${config.posterPrice}`,
          network: config.networkId,
          payTo: config.payToAddress,
        },
      ],
      description: 'Generate a custom city map poster',
      maxTimeoutSeconds: 300,
    },
  };

  // Apply payment middleware
  app.use(paymentMiddleware(paymentConfig, server));

  console.log(`x402 middleware configured:`);
  console.log(`  - Network: ${config.networkId} (${config.network})`);
  console.log(`  - Price: $${config.posterPrice} USDC`);
  console.log(`  - Pay to: ${config.payToAddress}`);
  console.log(`  - Facilitator: ${config.facilitatorUrl}`);
}
