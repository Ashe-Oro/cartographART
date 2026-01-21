import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { config } from '../config.js';

/**
 * Set up x402 payment middleware for the Express app.
 * Protects the POST /api/posters endpoint with USDC payment.
 */
export function setupX402Middleware(app) {
  // Create facilitator client
  // For mainnet, CDP facilitator requires authentication headers
  const facilitatorOptions = {
    url: config.facilitatorUrl,
  };

  // Add CDP API credentials for mainnet facilitator
  if (config.isMainnet && config.cdpApiKeyId && config.cdpApiKeySecret) {
    facilitatorOptions.headers = {
      'X-CDP-API-Key-ID': config.cdpApiKeyId,
      'X-CDP-API-Key-Secret': config.cdpApiKeySecret,
    };
  }

  const facilitatorClient = new HTTPFacilitatorClient(facilitatorOptions);

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
