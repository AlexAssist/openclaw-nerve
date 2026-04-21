// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { createTelemetryHttpTransport } from './http.js';

describe('telemetry http transport', () => {
  it('retries network and 5xx failures, then succeeds', async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));

    const transport = createTelemetryHttpTransport({
      baseUrl: 'https://telemetry.example.com',
      fetchImpl,
      maxRequestBytes: 1024,
      maxRetries: 2,
      timeoutMs: 250,
    });

    await expect(transport.postJson('/v1/error', { ok: true })).resolves.toBeUndefined();

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://telemetry.example.com/v1/error');
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    });
    expect(fetchImpl.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('does not retry 4xx responses and drops oversize payloads', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('bad request', { status: 400 }));

    const transport = createTelemetryHttpTransport({
      baseUrl: 'https://telemetry.example.com',
      fetchImpl,
      maxRequestBytes: 32,
      maxRetries: 2,
      timeoutMs: 250,
    });

    await expect(transport.postJson('/v1/error', { ok: true })).resolves.toBeUndefined();
    await expect(transport.postJson('/v1/error', { payload: 'x'.repeat(128) })).resolves.toBeUndefined();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('never bubbles transport exceptions back to callers', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('still down'));

    const transport = createTelemetryHttpTransport({
      baseUrl: 'https://telemetry.example.com',
      fetchImpl,
      maxRequestBytes: 1024,
      maxRetries: 1,
      timeoutMs: 250,
    });

    await expect(transport.postJson('/v1/error', { ok: true })).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
