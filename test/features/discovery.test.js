import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DISCOVERY_PATH, getPlatformManifest } from '../../src/contracts/index.js';
import worker from '../../src/index.js';

/** @type {ExecutionContext} */
const executionContext = { waitUntil() {}, passThroughOnException() {} };

describe('Instance discovery', () => {
  /** @type {{match: ReturnType<typeof vi.fn>, put: ReturnType<typeof vi.fn>}} */
  let cache;

  beforeEach(() => {
    cache = { match: vi.fn(), put: vi.fn() };
    vi.stubGlobal('caches', { default: cache });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Discovery must remain local'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns the shared manifest without upstream or cache access', async () => {
    const response = await worker.fetch(
      new Request(`https://xget.example${DISCOVERY_PATH}`),
      {},
      executionContext
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(response.headers.get('Strict-Transport-Security')).toBeTruthy();
    expect(await response.json()).toEqual(getPlatformManifest());
    expect(fetch).not.toHaveBeenCalled();
    expect(cache.match).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('supports HEAD with no body and the same capability headers', async () => {
    const response = await worker.fetch(
      new Request(`https://xget.example${DISCOVERY_PATH}`, { method: 'HEAD' }),
      {},
      executionContext
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(await response.text()).toBe('');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['POST', 'PUT', 'DELETE', 'OPTIONS'])(
    'returns a versioned method error for %s',
    async method => {
      const response = await worker.fetch(
        new Request(`https://xget.example${DISCOVERY_PATH}`, { method }),
        { ALLOWED_METHODS: 'GET,HEAD,POST,PUT,DELETE,OPTIONS' },
        executionContext
      );
      expect(response.status).toBe(405);
      expect(response.headers.get('Allow')).toBe('GET, HEAD');
      expect(await response.json()).toMatchObject({
        schemaVersion: 1,
        error: { code: 'METHOD_NOT_ALLOWED' }
      });
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it('applies configured CORS rules to discovery', async () => {
    const env = { ALLOWED_ORIGINS: 'https://allowed.example' };
    for (const origin of ['https://allowed.example', 'https://other.example']) {
      const response = await worker.fetch(
        new Request(`https://xget.example${DISCOVERY_PATH}`, { headers: { Origin: origin } }),
        env,
        executionContext
      );
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
        origin === 'https://allowed.example' ? origin : null
      );
    }
  });

  it('advertises only read methods on a CORS preflight', async () => {
    const response = await worker.fetch(
      new Request(`https://xget.example${DISCOVERY_PATH}`, {
        method: 'OPTIONS',
        headers: { Origin: 'https://allowed.example', 'Access-Control-Request-Method': 'GET' }
      }),
      { ALLOWED_METHODS: 'GET,HEAD,POST' },
      executionContext
    );
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, HEAD');
    expect(await response.text()).toBe('');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects a write preflight with a structured method error', async () => {
    const response = await worker.fetch(
      new Request(`https://xget.example${DISCOVERY_PATH}`, {
        method: 'OPTIONS',
        headers: { Origin: 'https://allowed.example', 'Access-Control-Request-Method': 'POST' }
      }),
      { ALLOWED_METHODS: 'GET,HEAD,POST' },
      executionContext
    );
    expect(response.status).toBe(405);
    expect(await response.json()).toMatchObject({ error: { code: 'METHOD_NOT_ALLOWED' } });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('routes crates search to the API while preserving ordinary homepage redirects', async () => {
    const upstream = vi
      .mocked(fetch)
      .mockResolvedValue(new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
    const response = await worker.fetch(
      new Request('https://xget.example/crates/?q=serde'),
      {},
      executionContext
    );
    expect(response.status).toBe(200);
    expect(upstream.mock.calls[0][0]).toBe('https://crates.io/api/v1/crates?q=serde');
    const bareGithub = await worker.fetch(
      new Request('https://xget.example/gh/'),
      {},
      executionContext
    );
    expect(bareGithub.status).toBe(302);
    const bareCrates = await worker.fetch(
      new Request('https://xget.example/crates'),
      {},
      executionContext
    );
    expect(bareCrates.status).toBe(302);
  });
});
