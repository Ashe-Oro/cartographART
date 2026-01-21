/**
 * Comprehensive tests for x402 payment enforcement.
 *
 * These tests verify that:
 * 1. POST /api/posters requires payment (returns 402 without valid payment)
 * 2. Invalid payment headers are rejected
 * 3. Payment cannot be bypassed through parameter/header manipulation
 * 4. Other endpoints (themes, jobs, health) do NOT require payment
 * 5. The 402 response format is correct
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

// Silence config logging during tests
const originalLog = console.log;
const originalWarn = console.warn;

let app;

beforeAll(async () => {
  // Suppress startup logging
  console.log = () => {};
  console.warn = () => {};

  // Create app without WebSocket for simpler testing
  app = createApp({ enableWebSocket: false });
});

afterAll(() => {
  console.log = originalLog;
  console.warn = originalWarn;
});

// Valid poster request payload
const validPosterRequest = {
  city: 'San Francisco',
  country: 'USA',
  theme: 'blueprint',
  size: 'auto',
};

describe('Payment Required (402 Response)', () => {
  it('POST /api/posters without payment header returns 402', async () => {
    const response = await request(app)
      .post('/api/posters')
      .send(validPosterRequest)
      .set('Content-Type', 'application/json');

    expect(response.status).toBe(402);
  });

  it('POST /api/posters with empty PAYMENT-SIGNATURE header returns 402', async () => {
    const response = await request(app)
      .post('/api/posters')
      .send(validPosterRequest)
      .set('Content-Type', 'application/json')
      .set('PAYMENT-SIGNATURE', '');

    expect(response.status).toBe(402);
  });

  it('POST /api/posters with empty X-PAYMENT header returns 402', async () => {
    const response = await request(app)
      .post('/api/posters')
      .send(validPosterRequest)
      .set('Content-Type', 'application/json')
      .set('X-PAYMENT', '');

    expect(response.status).toBe(402);
  });

  it('402 response contains PAYMENT-REQUIRED header', async () => {
    const response = await request(app)
      .post('/api/posters')
      .send(validPosterRequest)
      .set('Content-Type', 'application/json');

    expect(response.status).toBe(402);
    expect(response.headers['payment-required']).toBeDefined();
  });

  it('PAYMENT-REQUIRED header is valid base64', async () => {
    const response = await request(app)
      .post('/api/posters')
      .send(validPosterRequest)
      .set('Content-Type', 'application/json');

    const paymentHeader = response.headers['payment-required'];
    expect(paymentHeader).toBeDefined();

    // Should be valid base64
    const decoded = Buffer.from(paymentHeader, 'base64').toString();
    const parsed = JSON.parse(decoded);

    expect(parsed).toHaveProperty('x402Version');
    expect(parsed).toHaveProperty('accepts');
  });
});

describe('Invalid Payment Headers', () => {
  it('rejects invalid base64 in PAYMENT-SIGNATURE', async () => {
    const response = await request(app)
      .post('/api/posters')
      .send(validPosterRequest)
      .set('Content-Type', 'application/json')
      .set('PAYMENT-SIGNATURE', 'not-valid-base64!!!');

    // Should reject with 400 or 402, not 200
    expect([400, 402]).toContain(response.status);
  });

  it('rejects malformed JSON in payment header', async () => {
    const invalidJson = Buffer.from('not valid json {{{').toString('base64');

    const response = await request(app)
      .post('/api/posters')
      .send(validPosterRequest)
      .set('Content-Type', 'application/json')
      .set('PAYMENT-SIGNATURE', invalidJson);

    expect([400, 402]).toContain(response.status);
  });

  it('rejects payment with missing signature field', async () => {
    const paymentData = {
      x402Version: 2,
      scheme: 'exact',
      network: 'eip155:8453',
      resource: 'http://localhost:8000/api/posters',
      payload: {
        authorization: {
          from: '0x1234567890123456789012345678901234567890',
          to: '0x1234567890123456789012345678901234567890',
          value: '1000',
          validAfter: '0',
          validBefore: '9999999999',
          nonce: '0x' + '00'.repeat(32),
        },
        // Missing "signature" field
      },
    };
    const paymentHeader = Buffer.from(JSON.stringify(paymentData)).toString('base64');

    const response = await request(app)
      .post('/api/posters')
      .send(validPosterRequest)
      .set('Content-Type', 'application/json')
      .set('PAYMENT-SIGNATURE', paymentHeader);

    // Should NOT return 200
    expect(response.status).not.toBe(200);
  });

  it('rejects payment with invalid/fake signature', async () => {
    const paymentData = {
      x402Version: 2,
      scheme: 'exact',
      network: 'eip155:8453',
      resource: 'http://localhost:8000/api/posters',
      accepted: {
        scheme: 'exact',
        network: 'eip155:8453',
        amount: '1000',
        asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        payTo: '0x8A9913c6b40E8bb9015435c232D808394e6936d7',
      },
      payload: {
        signature: '0x' + '00'.repeat(65), // Invalid signature (all zeros)
        authorization: {
          from: '0x1234567890123456789012345678901234567890',
          to: '0x8A9913c6b40E8bb9015435c232D808394e6936d7',
          value: '1000',
          validAfter: '0',
          validBefore: '9999999999',
          nonce: '0x' + 'ab'.repeat(32),
        },
        eip712Domain: {
          name: 'USD Coin',
          version: '2',
          chainId: 8453,
          verifyingContract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        },
      },
    };
    const paymentHeader = Buffer.from(JSON.stringify(paymentData)).toString('base64');

    const response = await request(app)
      .post('/api/posters')
      .send(validPosterRequest)
      .set('Content-Type', 'application/json')
      .set('PAYMENT-SIGNATURE', paymentHeader);

    // Should NOT return 200 - facilitator should reject invalid signature
    expect(response.status).not.toBe(200);
  });

  it('rejects payment with wrong amount', async () => {
    const paymentData = {
      x402Version: 2,
      scheme: 'exact',
      network: 'eip155:8453',
      resource: 'http://localhost:8000/api/posters',
      accepted: {
        scheme: 'exact',
        network: 'eip155:8453',
        amount: '1', // Way too small
        asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        payTo: '0x8A9913c6b40E8bb9015435c232D808394e6936d7',
      },
      payload: {
        signature: '0x' + 'ab'.repeat(65),
        authorization: {
          from: '0x1234567890123456789012345678901234567890',
          to: '0x8A9913c6b40E8bb9015435c232D808394e6936d7',
          value: '1', // Wrong amount
          validAfter: '0',
          validBefore: '9999999999',
          nonce: '0x' + 'ab'.repeat(32),
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

  it('rejects payment with wrong network', async () => {
    const paymentData = {
      x402Version: 2,
      scheme: 'exact',
      network: 'eip155:1', // Ethereum mainnet, not Base
      resource: 'http://localhost:8000/api/posters',
      payload: {
        signature: '0x' + 'ab'.repeat(65),
        authorization: {
          from: '0x1234567890123456789012345678901234567890',
          to: '0x8A9913c6b40E8bb9015435c232D808394e6936d7',
          value: '1000',
          validAfter: '0',
          validBefore: '9999999999',
          nonce: '0x' + 'ab'.repeat(32),
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

describe('Payment Bypass Attempts - Headers', () => {
  const bypassHeaders = [
    { 'X-Forwarded-For': '127.0.0.1' },
    { 'X-Real-IP': '127.0.0.1' },
    { 'X-Payment-Bypass': 'true' },
    { Authorization: 'Bearer admin' },
    { 'X-Admin': 'true' },
    { 'X-Internal': 'true' },
    { 'X-Skip-Payment': '1' },
    { 'X-Test-Mode': 'true' },
    { 'X-Free-Access': 'true' },
    { 'X-Paid': 'true' },
  ];

  bypassHeaders.forEach((headers) => {
    const headerName = Object.keys(headers)[0];
    it(`cannot bypass payment with ${headerName} header`, async () => {
      const response = await request(app)
        .post('/api/posters')
        .send(validPosterRequest)
        .set('Content-Type', 'application/json')
        .set(headers);

      expect(response.status).toBe(402);
    });
  });
});

describe('Payment Bypass Attempts - Query Parameters', () => {
  const bypassParams = [
    'skip_payment=true',
    'admin=true',
    'free=1',
    'bypass=1',
    'test=true',
    'paid=true',
    'no_payment=1',
    'debug=true',
    'internal=true',
  ];

  bypassParams.forEach((params) => {
    it(`cannot bypass payment with ?${params}`, async () => {
      const response = await request(app)
        .post(`/api/posters?${params}`)
        .send(validPosterRequest)
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(402);
    });
  });
});

describe('Payment Bypass Attempts - Body Manipulation', () => {
  const bypassPayloads = [
    { ...validPosterRequest, paid: true },
    { ...validPosterRequest, skip_payment: true },
    { ...validPosterRequest, free: true },
    { ...validPosterRequest, admin: true },
    { ...validPosterRequest, payment_confirmed: true },
    { ...validPosterRequest, bypass_payment: true },
    { ...validPosterRequest, test_mode: true },
    { ...validPosterRequest, internal: true },
  ];

  bypassPayloads.forEach((payload, index) => {
    const extraField = Object.keys(payload).find((k) => !Object.keys(validPosterRequest).includes(k));
    it(`cannot bypass payment with body field: ${extraField}`, async () => {
      const response = await request(app)
        .post('/api/posters')
        .send(payload)
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(402);
    });
  });
});

describe('Payment Bypass Attempts - HTTP Methods', () => {
  it('PUT method cannot create posters', async () => {
    const response = await request(app)
      .put('/api/posters')
      .send(validPosterRequest)
      .set('Content-Type', 'application/json');

    // Should return 404 or 405, not bypass to 200
    expect([404, 405]).toContain(response.status);
  });

  it('PATCH method cannot create posters', async () => {
    const response = await request(app)
      .patch('/api/posters')
      .send(validPosterRequest)
      .set('Content-Type', 'application/json');

    expect([404, 405]).toContain(response.status);
  });

  it('DELETE method cannot create posters', async () => {
    const response = await request(app)
      .delete('/api/posters')
      .send(validPosterRequest)
      .set('Content-Type', 'application/json');

    expect([404, 405]).toContain(response.status);
  });
});

describe('Payment Bypass Attempts - Path Manipulation', () => {
  const bypassPaths = [
    '/api/posters/',
    '/api/posters//',
    '/api//posters',
    '/API/POSTERS', // Case sensitivity
    '/Api/Posters',
  ];

  bypassPaths.forEach((path) => {
    it(`cannot bypass via path: ${path}`, async () => {
      const response = await request(app)
        .post(path)
        .send(validPosterRequest)
        .set('Content-Type', 'application/json');

      // Should be 402 (payment required), 404 (not found), or 307/308 (redirect)
      expect([402, 404, 307, 308]).toContain(response.status);
      expect(response.status).not.toBe(200);
    });
  });
});

describe('Non-Payment Endpoints', () => {
  it('GET /health does NOT require payment', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'ok');
  });

  it('GET /api/themes does NOT require payment', async () => {
    const response = await request(app).get('/api/themes');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('themes');
  });

  it('GET /api/jobs/:id does NOT require payment (returns 404 for unknown)', async () => {
    const response = await request(app).get('/api/jobs/nonexistent-job-id');

    // Should be 404 (not found), not 402 (payment required)
    expect(response.status).toBe(404);
  });

  it('GET /api/posters/:id (download) does NOT require payment', async () => {
    const response = await request(app).get('/api/posters/nonexistent-job-id');

    // Should be 404 (not found), not 402 (payment required)
    expect(response.status).toBe(404);
  });
});

describe('402 Response Format', () => {
  it('contains x402Version field', async () => {
    const response = await request(app)
      .post('/api/posters')
      .send(validPosterRequest)
      .set('Content-Type', 'application/json');

    const paymentHeader = response.headers['payment-required'];
    const parsed = JSON.parse(Buffer.from(paymentHeader, 'base64').toString());

    expect(parsed.x402Version).toBe(2);
  });

  it('contains accepts array with payment options', async () => {
    const response = await request(app)
      .post('/api/posters')
      .send(validPosterRequest)
      .set('Content-Type', 'application/json');

    const paymentHeader = response.headers['payment-required'];
    const parsed = JSON.parse(Buffer.from(paymentHeader, 'base64').toString());

    expect(Array.isArray(parsed.accepts)).toBe(true);
    expect(parsed.accepts.length).toBeGreaterThan(0);
  });

  it('accepts array contains required fields', async () => {
    const response = await request(app)
      .post('/api/posters')
      .send(validPosterRequest)
      .set('Content-Type', 'application/json');

    const paymentHeader = response.headers['payment-required'];
    const parsed = JSON.parse(Buffer.from(paymentHeader, 'base64').toString());

    const scheme = parsed.accepts[0];
    expect(scheme).toHaveProperty('scheme');
    expect(scheme).toHaveProperty('network');
    expect(scheme).toHaveProperty('amount');
    expect(scheme).toHaveProperty('asset');
    expect(scheme).toHaveProperty('payTo');
  });

  it('specifies correct network (Base mainnet or Sepolia)', async () => {
    const response = await request(app)
      .post('/api/posters')
      .send(validPosterRequest)
      .set('Content-Type', 'application/json');

    const paymentHeader = response.headers['payment-required'];
    const parsed = JSON.parse(Buffer.from(paymentHeader, 'base64').toString());

    const scheme = parsed.accepts[0];
    expect(['eip155:8453', 'eip155:84532']).toContain(scheme.network);
  });

  it('specifies USDC as payment asset', async () => {
    const response = await request(app)
      .post('/api/posters')
      .send(validPosterRequest)
      .set('Content-Type', 'application/json');

    const paymentHeader = response.headers['payment-required'];
    const parsed = JSON.parse(Buffer.from(paymentHeader, 'base64').toString());

    const scheme = parsed.accepts[0];
    const usdcAddresses = [
      '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // Base Sepolia
      '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base Mainnet
    ];
    expect(usdcAddresses.map((a) => a.toLowerCase())).toContain(scheme.asset.toLowerCase());
  });

  it('contains resource information', async () => {
    const response = await request(app)
      .post('/api/posters')
      .send(validPosterRequest)
      .set('Content-Type', 'application/json');

    const paymentHeader = response.headers['payment-required'];
    const parsed = JSON.parse(Buffer.from(paymentHeader, 'base64').toString());

    expect(parsed).toHaveProperty('resource');
    expect(parsed.resource).toHaveProperty('url');
    expect(parsed.resource).toHaveProperty('description');
  });
});

describe('Input Validation (still requires payment)', () => {
  it('returns 402 even with invalid city (empty)', async () => {
    const response = await request(app)
      .post('/api/posters')
      .send({ ...validPosterRequest, city: '' })
      .set('Content-Type', 'application/json');

    // Payment check happens before validation, so should still be 402
    expect(response.status).toBe(402);
  });

  it('returns 402 even with invalid theme', async () => {
    const response = await request(app)
      .post('/api/posters')
      .send({ ...validPosterRequest, theme: 'nonexistent_theme_xyz' })
      .set('Content-Type', 'application/json');

    expect(response.status).toBe(402);
  });

  it('returns 402 even with missing required fields', async () => {
    const response = await request(app)
      .post('/api/posters')
      .send({ city: 'Test' }) // Missing country
      .set('Content-Type', 'application/json');

    expect(response.status).toBe(402);
  });

  it('returns 402 even with completely empty body', async () => {
    const response = await request(app)
      .post('/api/posters')
      .send({})
      .set('Content-Type', 'application/json');

    expect(response.status).toBe(402);
  });
});

describe('Edge Cases', () => {
  it('handles very long city names', async () => {
    const response = await request(app)
      .post('/api/posters')
      .send({ ...validPosterRequest, city: 'A'.repeat(1000) })
      .set('Content-Type', 'application/json');

    expect(response.status).toBe(402);
  });

  it('handles special characters in city name', async () => {
    const response = await request(app)
      .post('/api/posters')
      .send({ ...validPosterRequest, city: "<script>alert('xss')</script>" })
      .set('Content-Type', 'application/json');

    expect(response.status).toBe(402);
  });

  it('handles unicode in city name', async () => {
    const response = await request(app)
      .post('/api/posters')
      .send({ ...validPosterRequest, city: '東京' })
      .set('Content-Type', 'application/json');

    expect(response.status).toBe(402);
  });

  it('handles concurrent requests', async () => {
    const requests = Array(5)
      .fill(null)
      .map(() =>
        request(app)
          .post('/api/posters')
          .send(validPosterRequest)
          .set('Content-Type', 'application/json')
      );

    const responses = await Promise.all(requests);

    responses.forEach((response) => {
      expect(response.status).toBe(402);
    });
  });
});
