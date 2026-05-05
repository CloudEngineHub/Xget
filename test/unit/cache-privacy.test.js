import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import worker from '../../src/index.js';

describe('Cache Privacy', () => {
  /** @type {{ match: ReturnType<typeof vi.fn>, put: ReturnType<typeof vi.fn> }} */
  let cacheDefault;

  /** @type {ReturnType<typeof vi.fn>} */
  let fetchStub;

  beforeEach(() => {
    cacheDefault = {
      match: vi.fn(async () => null),
      put: vi.fn(async () => undefined)
    };

    vi.stubGlobal('caches', { default: cacheDefault });

    fetchStub = vi.fn(async () => {
      return new Response('ok', {
        status: 200,
        headers: {
          'Content-Type': 'text/plain'
        }
      });
    });
    vi.stubGlobal('fetch', fetchStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should not use Cache API for requests with Authorization', async () => {
    const request = new Request('https://example.com/gh/test/repo/file.txt', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-token'
      }
    });

    const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };
    const response = await worker.fetch(request, {}, ctx);

    expect(response.status).toBe(200);
    expect(cacheDefault.match).not.toHaveBeenCalled();
    expect(cacheDefault.put).not.toHaveBeenCalled();
    expect(fetchStub).toHaveBeenCalled();
    expect(fetchStub.mock.calls[0][1]?.cf).toBeUndefined();
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('should not enable Cloudflare fetch caching for requests with Cookie', async () => {
    const request = new Request('https://example.com/gh/test/repo/file.txt', {
      method: 'GET',
      headers: {
        Cookie: 'session=secret'
      }
    });

    const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };
    const response = await worker.fetch(request, {}, ctx);

    expect(response.status).toBe(200);
    expect(cacheDefault.match).not.toHaveBeenCalled();
    expect(cacheDefault.put).not.toHaveBeenCalled();
    expect(fetchStub).toHaveBeenCalled();
    expect(fetchStub.mock.calls[0][1]?.cf).toBeUndefined();
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('should use Cache API for non-authenticated GET requests', async () => {
    const request = new Request('https://example.com/gh/test/repo/file.txt', {
      method: 'GET'
    });

    const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };
    const response = await worker.fetch(request, {}, ctx);

    expect(response.status).toBe(200);
    expect(cacheDefault.match).toHaveBeenCalled();
    expect(fetchStub).toHaveBeenCalled();
    expect(response.headers.get('Cache-Control') || '').toContain('public');
  });
});
