/**
 * Tests for multi-chain x402 payment support (Base EVM + Solana).
 *
 * Verifies that:
 * 1. The 402 response advertises both EVM and Solana payment options
 * 2. Each payment option has correct network IDs, assets, and addresses
 * 3. Invalid payments on either chain are rejected
 * 4. Solana-specific payment headers are rejected (not accepted as EVM)
 * 5. EVM-specific payment headers are rejected (not accepted as Solana)
 * 6. Config-driven behavior (Solana only appears when PAY_TO_ADDRESS_SOL is set)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';

const originalLog = console.log;
const originalWarn = console.warn;

let app;

beforeAll(async () => {
  console.log = () => {};
  console.warn = () => {};
  app = createApp({ enableWebSocket: false });
});

afterAll(() => {
  console.log = originalLog;
  console.warn = originalWarn;
});

const validPosterRequest = {
  city: 'San Francisco',
  country: 'USA',
  theme: 'blueprint',
  size: 'auto',
};

/**
 * Helper to get parsed 402 payment requirements from the server.
 */
async function getPaymentRequirements() {
  const response = await request(app)
    .post('/api/posters')
    .send(validPosterRequest)
    .set('Content-Type', 'application/json');

  expect(response.status).toBe(402);
  const paymentHeader = response.headers['payment-required'];
  expect(paymentHeader).toBeDefined();
  return JSON.parse(Buffer.from(paymentHeader, 'base64').toString());
}

// ─── 402 Response: Multi-chain Accepts ────────────────────────────────

describe('Multi-chain 402 Response', () => {
  it('contains an accepts array', async () => {
    const parsed = await getPaymentRequirements();
    expect(Array.isArray(parsed.accepts)).toBe(true);
    expect(parsed.accepts.length).toBeGreaterThanOrEqual(1);
  });

  it('always includes EVM (Base) payment option', async () => {
    const parsed = await getPaymentRequirements();
    const evmOption = parsed.accepts.find(a => a.network.startsWith('eip155:'));
    expect(evmOption).toBeDefined();
    expect(evmOption.scheme).toBe('exact');
    expect(evmOption.payTo).toBeTruthy();
  });

  it('includes Solana payment option when PAY_TO_ADDRESS_SOL is configured', async () => {
    const parsed = await getPaymentRequirements();

    if (config.payToAddressSol) {
      const solOption = parsed.accepts.find(a => a.network.startsWith('solana:'));
      expect(solOption).toBeDefined();
      expect(solOption.scheme).toBe('exact');
      expect(solOption.payTo).toBe(config.payToAddressSol);
    }
  });

  it('does NOT include Solana option when PAY_TO_ADDRESS_SOL is empty', async () => {
    // This test validates the current test env — if SOL address is not set,
    // Solana should be absent from accepts
    if (!config.payToAddressSol) {
      const parsed = await getPaymentRequirements();
      const solOption = parsed.accepts.find(a => a.network.startsWith('solana:'));
      expect(solOption).toBeUndefined();
    }
  });

  it('all payment options use the same price', async () => {
    const parsed = await getPaymentRequirements();
    const amounts = parsed.accepts.map(a => a.amount);
    const uniqueAmounts = [...new Set(amounts)];
    expect(uniqueAmounts.length).toBe(1);
  });

  it('all payment options use the "exact" scheme', async () => {
    const parsed = await getPaymentRequirements();
    parsed.accepts.forEach(option => {
      expect(option.scheme).toBe('exact');
    });
  });
});

// ─── EVM Payment Option Validation ────────────────────────────────────

describe('EVM (Base) Payment Option', () => {
  it('uses correct EVM network ID', async () => {
    const parsed = await getPaymentRequirements();
    const evmOption = parsed.accepts.find(a => a.network.startsWith('eip155:'));
    expect(['eip155:8453', 'eip155:84532']).toContain(evmOption.network);
  });

  it('specifies USDC as asset', async () => {
    const parsed = await getPaymentRequirements();
    const evmOption = parsed.accepts.find(a => a.network.startsWith('eip155:'));
    const validUsdcAddresses = [
      '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base Mainnet
      '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // Base Sepolia
    ];
    expect(validUsdcAddresses.map(a => a.toLowerCase())).toContain(
      evmOption.asset.toLowerCase()
    );
  });

  it('has a valid EVM payTo address (starts with 0x)', async () => {
    const parsed = await getPaymentRequirements();
    const evmOption = parsed.accepts.find(a => a.network.startsWith('eip155:'));
    expect(evmOption.payTo).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it('has a non-zero amount', async () => {
    const parsed = await getPaymentRequirements();
    const evmOption = parsed.accepts.find(a => a.network.startsWith('eip155:'));
    expect(parseInt(evmOption.amount)).toBeGreaterThan(0);
  });
});

// ─── Solana Payment Option Validation ─────────────────────────────────

describe('Solana Payment Option', () => {
  // These tests run conditionally — only when Solana is configured
  const solanaConfigured = !!config.payToAddressSol;

  it.skipIf(!solanaConfigured)(
    'uses correct Solana network ID',
    async () => {
      const parsed = await getPaymentRequirements();
      const solOption = parsed.accepts.find(a => a.network.startsWith('solana:'));
      expect([
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',  // Mainnet
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',   // Devnet
      ]).toContain(solOption.network);
    }
  );

  it.skipIf(!solanaConfigured)(
    'specifies Solana USDC as asset',
    async () => {
      const parsed = await getPaymentRequirements();
      const solOption = parsed.accepts.find(a => a.network.startsWith('solana:'));
      const validSolUsdcAddresses = [
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',   // Solana Mainnet USDC
        '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',   // Solana Devnet USDC
      ];
      // The asset may or may not be set depending on x402 middleware version
      if (solOption.asset) {
        expect(validSolUsdcAddresses).toContain(solOption.asset);
      }
    }
  );

  it.skipIf(!solanaConfigured)(
    'has a valid Solana payTo address (base58)',
    async () => {
      const parsed = await getPaymentRequirements();
      const solOption = parsed.accepts.find(a => a.network.startsWith('solana:'));
      // Solana addresses are base58: 32-44 chars, alphanumeric (no 0, O, I, l)
      expect(solOption.payTo).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    }
  );

  it.skipIf(!solanaConfigured)(
    'has the same amount as the EVM option',
    async () => {
      const parsed = await getPaymentRequirements();
      const evmOption = parsed.accepts.find(a => a.network.startsWith('eip155:'));
      const solOption = parsed.accepts.find(a => a.network.startsWith('solana:'));
      expect(solOption.amount).toBe(evmOption.amount);
    }
  );
});

// ─── Invalid EVM Payments ─────────────────────────────────────────────

describe('Invalid EVM Payment Rejection', () => {
  it('rejects EVM payment with fake signature', async () => {
    const paymentData = {
      x402Version: 2,
      scheme: 'exact',
      network: config.networkId,
      payload: {
        signature: '0x' + 'ab'.repeat(65),
        authorization: {
          from: '0x1234567890123456789012345678901234567890',
          to: config.payToAddress,
          value: '100000',
          validAfter: '0',
          validBefore: '9999999999',
          nonce: '0x' + 'cd'.repeat(32),
        },
      },
    };
    const paymentHeader = Buffer.from(JSON.stringify(paymentData)).toString('base64');

    const response = await request(app)
      .post('/api/posters')
      .send(validPosterRequest)
      .set('Content-Type', 'application/json')
      .set('PAYMENT-SIGNATURE', paymentHeader);

    expect(response.status).not.toBe(200);
  });

  it('rejects EVM payment targeting wrong network', async () => {
    const paymentData = {
      x402Version: 2,
      scheme: 'exact',
      network: 'eip155:1', // Ethereum mainnet, not Base
      payload: {
        signature: '0x' + 'ab'.repeat(65),
        authorization: {
          from: '0x1234567890123456789012345678901234567890',
          to: config.payToAddress,
          value: '100000',
          validAfter: '0',
          validBefore: '9999999999',
          nonce: '0x' + 'cd'.repeat(32),
        },
      },
    };
    const paymentHeader = Buffer.from(JSON.stringify(paymentData)).toString('base64');

    const response = await request(app)
      .post('/api/posters')
      .send(validPosterRequest)
      .set('Content-Type', 'application/json')
      .set('PAYMENT-SIGNATURE', paymentHeader);

    expect(response.status).not.toBe(200);
  });

  it('rejects EVM payment with zero amount', async () => {
    const paymentData = {
      x402Version: 2,
      scheme: 'exact',
      network: config.networkId,
      accepted: {
        scheme: 'exact',
        network: config.networkId,
        amount: '0',
        asset: config.usdcAddress,
        payTo: config.payToAddress,
      },
      payload: {
        signature: '0x' + 'ab'.repeat(65),
        authorization: {
          from: '0x1234567890123456789012345678901234567890',
          to: config.payToAddress,
          value: '0',
          validAfter: '0',
          validBefore: '9999999999',
          nonce: '0x' + 'cd'.repeat(32),
        },
      },
    };
    const paymentHeader = Buffer.from(JSON.stringify(paymentData)).toString('base64');

    const response = await request(app)
      .post('/api/posters')
      .send(validPosterRequest)
      .set('Content-Type', 'application/json')
      .set('PAYMENT-SIGNATURE', paymentHeader);

    expect(response.status).not.toBe(200);
  });
});

// ─── Invalid Solana Payments ──────────────────────────────────────────

describe('Invalid Solana Payment Rejection', () => {
  it('rejects Solana payment with fake transaction', async () => {
    const paymentData = {
      x402Version: 2,
      scheme: 'exact',
      network: config.solanaNetworkId,
      payload: {
        transaction: Buffer.from('fake-solana-transaction-data').toString('base64'),
      },
    };
    const paymentHeader = Buffer.from(JSON.stringify(paymentData)).toString('base64');

    const response = await request(app)
      .post('/api/posters')
      .send(validPosterRequest)
      .set('Content-Type', 'application/json')
      .set('PAYMENT-SIGNATURE', paymentHeader);

    expect(response.status).not.toBe(200);
  });

  it('rejects Solana payment with empty transaction', async () => {
    const paymentData = {
      x402Version: 2,
      scheme: 'exact',
      network: config.solanaNetworkId,
      payload: {
        transaction: '',
      },
    };
    const paymentHeader = Buffer.from(JSON.stringify(paymentData)).toString('base64');

    const response = await request(app)
      .post('/api/posters')
      .send(validPosterRequest)
      .set('Content-Type', 'application/json')
      .set('PAYMENT-SIGNATURE', paymentHeader);

    expect(response.status).not.toBe(200);
  });

  it('rejects Solana payment targeting wrong Solana network', async () => {
    // Use a made-up Solana network ID
    const paymentData = {
      x402Version: 2,
      scheme: 'exact',
      network: 'solana:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      payload: {
        transaction: Buffer.from('fake-tx').toString('base64'),
      },
    };
    const paymentHeader = Buffer.from(JSON.stringify(paymentData)).toString('base64');

    const response = await request(app)
      .post('/api/posters')
      .send(validPosterRequest)
      .set('Content-Type', 'application/json')
      .set('PAYMENT-SIGNATURE', paymentHeader);

    expect(response.status).not.toBe(200);
  });

  it('rejects Solana payment with malformed base64 transaction', async () => {
    const paymentData = {
      x402Version: 2,
      scheme: 'exact',
      network: config.solanaNetworkId,
      payload: {
        transaction: '!!!not-base64!!!',
      },
    };
    const paymentHeader = Buffer.from(JSON.stringify(paymentData)).toString('base64');

    const response = await request(app)
      .post('/api/posters')
      .send(validPosterRequest)
      .set('Content-Type', 'application/json')
      .set('PAYMENT-SIGNATURE', paymentHeader);

    expect(response.status).not.toBe(200);
  });
});

// ─── Cross-chain Confusion ────────────────────────────────────────────

describe('Cross-chain Payment Confusion', () => {
  it('rejects EVM-shaped payload sent with Solana network ID', async () => {
    const paymentData = {
      x402Version: 2,
      scheme: 'exact',
      network: config.solanaNetworkId, // Solana network
      payload: {
        // But EVM-style payload
        signature: '0x' + 'ab'.repeat(65),
        authorization: {
          from: '0x1234567890123456789012345678901234567890',
          to: config.payToAddress,
          value: '100000',
          validAfter: '0',
          validBefore: '9999999999',
          nonce: '0x' + 'cd'.repeat(32),
        },
      },
    };
    const paymentHeader = Buffer.from(JSON.stringify(paymentData)).toString('base64');

    const response = await request(app)
      .post('/api/posters')
      .send(validPosterRequest)
      .set('Content-Type', 'application/json')
      .set('PAYMENT-SIGNATURE', paymentHeader);

    expect(response.status).not.toBe(200);
  });

  it('rejects Solana-shaped payload sent with EVM network ID', async () => {
    const paymentData = {
      x402Version: 2,
      scheme: 'exact',
      network: config.networkId, // EVM network
      payload: {
        // But Solana-style payload
        transaction: Buffer.from('fake-solana-tx').toString('base64'),
      },
    };
    const paymentHeader = Buffer.from(JSON.stringify(paymentData)).toString('base64');

    const response = await request(app)
      .post('/api/posters')
      .send(validPosterRequest)
      .set('Content-Type', 'application/json')
      .set('PAYMENT-SIGNATURE', paymentHeader);

    expect(response.status).not.toBe(200);
  });
});

// ─── Config Validation ────────────────────────────────────────────────

describe('Multi-chain Config', () => {
  it('config has EVM network ID', () => {
    expect(config.networkId).toMatch(/^eip155:\d+$/);
  });

  it('config has Solana network ID', () => {
    expect(config.solanaNetworkId).toMatch(/^solana:/);
  });

  it('config uses correct mainnet Solana network ID', () => {
    if (config.isMainnet) {
      expect(config.solanaNetworkId).toBe('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp');
    }
  });

  it('config uses correct testnet Solana network ID', () => {
    if (!config.isMainnet) {
      expect(config.solanaNetworkId).toBe('solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1');
    }
  });

  it('EVM and Solana pay-to addresses are different formats', () => {
    if (config.payToAddress && config.payToAddressSol) {
      // EVM starts with 0x, Solana is base58
      expect(config.payToAddress).toMatch(/^0x/);
      expect(config.payToAddressSol).not.toMatch(/^0x/);
    }
  });
});

// ─── Protocol Version ─────────────────────────────────────────────────

describe('x402 Protocol Version', () => {
  it('uses x402 version 2', async () => {
    const parsed = await getPaymentRequirements();
    expect(parsed.x402Version).toBe(2);
  });

  it('includes resource info', async () => {
    const parsed = await getPaymentRequirements();
    expect(parsed).toHaveProperty('resource');
    expect(parsed.resource).toHaveProperty('url');
    expect(parsed.resource).toHaveProperty('description');
  });
});

// ─── Concurrent Multi-chain Requests ──────────────────────────────────

describe('Concurrent Requests', () => {
  it('handles concurrent requests returning consistent 402 with multi-chain accepts', async () => {
    const requests = Array(10)
      .fill(null)
      .map(() =>
        request(app)
          .post('/api/posters')
          .send(validPosterRequest)
          .set('Content-Type', 'application/json')
      );

    const responses = await Promise.all(requests);

    responses.forEach(response => {
      expect(response.status).toBe(402);
      const paymentHeader = response.headers['payment-required'];
      expect(paymentHeader).toBeDefined();

      const parsed = JSON.parse(Buffer.from(paymentHeader, 'base64').toString());
      // Every response should have the same number of accepts
      expect(parsed.accepts.length).toBe(responses.length > 0
        ? JSON.parse(Buffer.from(responses[0].headers['payment-required'], 'base64').toString()).accepts.length
        : 1
      );
    });
  });

  it('concurrent invalid EVM and Solana payments are all rejected', async () => {
    const evmPayment = {
      x402Version: 2,
      scheme: 'exact',
      network: config.networkId,
      payload: {
        signature: '0x' + 'ab'.repeat(65),
        authorization: {
          from: '0x1234567890123456789012345678901234567890',
          to: config.payToAddress,
          value: '100000',
          validAfter: '0',
          validBefore: '9999999999',
          nonce: '0x' + 'cd'.repeat(32),
        },
      },
    };

    const solPayment = {
      x402Version: 2,
      scheme: 'exact',
      network: config.solanaNetworkId,
      payload: {
        transaction: Buffer.from('fake-solana-tx').toString('base64'),
      },
    };

    const requests = [
      // 3 fake EVM payments
      ...Array(3).fill(null).map(() =>
        request(app)
          .post('/api/posters')
          .send(validPosterRequest)
          .set('Content-Type', 'application/json')
          .set('PAYMENT-SIGNATURE', Buffer.from(JSON.stringify(evmPayment)).toString('base64'))
      ),
      // 3 fake Solana payments
      ...Array(3).fill(null).map(() =>
        request(app)
          .post('/api/posters')
          .send(validPosterRequest)
          .set('Content-Type', 'application/json')
          .set('PAYMENT-SIGNATURE', Buffer.from(JSON.stringify(solPayment)).toString('base64'))
      ),
    ];

    const responses = await Promise.all(requests);
    responses.forEach(response => {
      expect(response.status).not.toBe(200);
    });
  });
});
