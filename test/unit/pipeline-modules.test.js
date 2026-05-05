import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRequestContext } from '../../src/app/request-context.js';
import { CONFIG } from '../../src/config/index.js';
import { finalizeResponse } from '../../src/response/finalize-response.js';
import { resolveTarget } from '../../src/routing/resolve-target.js';
import { tryReadCachedResponse } from '../../src/upstream/cache.js';
import { fetchUpstreamResponse } from '../../src/upstream/fetch-upstream.js';
import { PerformanceMonitor } from '../../src/utils/performance.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Pipeline modules', () => {
  it('reuses cached full content for range requests through the cache helper', async () => {
    const cache = {
      match: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(
          new Response('full-body', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' }
          })
        )
    };
    const monitor = new PerformanceMonitor();
    const markSpy = vi.spyOn(monitor, 'mark');
    const request = new Request('https://example.com/gh/user/repo/file.txt', {
      headers: { Range: 'bytes=0-3' }
    });

    const response = await tryReadCachedResponse({
      cache: /** @type {Cache} */ (/** @type {unknown} */ (cache)),
      cacheTargetUrl: 'https://github.com/user/repo/file.txt',
      canUseCache: true,
      hasSensitiveHeaders: false,
      monitor,
      request,
      requestContext: createRequestContext(request, {})
    });

    expect(await response?.text()).toBe('full-body');
    expect(markSpy).toHaveBeenCalledWith('cache_hit_full_content');
  });

  it('retries upstream fetches through the transport helper before succeeding', async () => {
    const request = new Request('https://example.com/gh/user/repo/file.txt');
    const requestContext = createRequestContext(request, {});
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('temporary-network-error'))
      .mockResolvedValueOnce(
        new Response('ok', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' }
        })
      );

    const result = await fetchUpstreamResponse({
      authorization: null,
      canUseCache: true,
      config: { ...CONFIG, MAX_RETRIES: 2, RETRY_DELAY_MS: 0 },
      effectivePath: '/gh/user/repo/file.txt',
      monitor: new PerformanceMonitor(),
      platform: 'gh',
      request,
      requestContext,
      shouldPassthroughRequest: false,
      targetUrl: 'https://github.com/user/repo/file.txt'
    });

    expect(result.responseGeneratedLocally).toBe(false);
    expect(result.response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('rewrites npm metadata and refreshes content length during response finalization', async () => {
    const request = new Request('https://example.com/npm/pkg');
    const requestContext = createRequestContext(request, {});
    const upstreamBody = JSON.stringify({
      dist: {
        tarball: 'https://registry.npmjs.org/pkg/-/pkg-1.0.0.tgz'
      }
    });

    const response = await finalizeResponse({
      cache: null,
      cacheTargetUrl: 'https://registry.npmjs.org/pkg',
      canUseCache: true,
      config: CONFIG,
      ctx: /** @type {ExecutionContext} */ ({ waitUntil() {}, passThroughOnException() {} }),
      effectivePath: '/npm/pkg',
      hasSensitiveHeaders: false,
      monitor: new PerformanceMonitor(),
      platform: 'npm',
      request,
      requestContext,
      response: new Response(upstreamBody, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(upstreamBody.length)
        }
      }),
      responseGeneratedLocally: false,
      url: new URL(request.url)
    });
    const body = await response.text();

    expect(body).toContain('https://example.com/npm/pkg/-/pkg-1.0.0.tgz');
    expect(response.headers.get('Content-Length')).toBe(
      String(new TextEncoder().encode(body).byteLength)
    );
    expect(response.headers.get('Cache-Control')).toBe(
      'public, max-age=0, s-maxage=60, must-revalidate'
    );
  });

  it('uses long-lived caching for immutable package artifacts', async () => {
    const artifactCases = [
      {
        cacheTargetUrl: 'https://registry.npmjs.org/pkg/-/pkg-1.0.0.tgz',
        effectivePath: '/npm/pkg/-/pkg-1.0.0.tgz',
        platform: 'npm',
        requestUrl: 'https://example.com/npm/pkg/-/pkg-1.0.0.tgz'
      },
      {
        cacheTargetUrl:
          'https://files.pythonhosted.org/packages/py3/r/requests/requests-2.31.0-py3-none-any.whl',
        effectivePath: '/pypi/files/packages/py3/r/requests/requests-2.31.0-py3-none-any.whl',
        platform: 'pypi-files',
        requestUrl:
          'https://example.com/pypi/files/packages/py3/r/requests/requests-2.31.0-py3-none-any.whl'
      },
      {
        cacheTargetUrl: 'https://repo1.maven.org/maven2/org/example/demo/1.0.0/demo-1.0.0.jar',
        effectivePath: '/maven/maven2/org/example/demo/1.0.0/demo-1.0.0.jar',
        platform: 'maven',
        requestUrl: 'https://example.com/maven/maven2/org/example/demo/1.0.0/demo-1.0.0.jar'
      }
    ];

    for (const artifactCase of artifactCases) {
      const request = new Request(artifactCase.requestUrl);
      const requestContext = createRequestContext(request, {});

      const response = await finalizeResponse({
        cache: null,
        cacheTargetUrl: artifactCase.cacheTargetUrl,
        canUseCache: true,
        config: CONFIG,
        ctx: /** @type {ExecutionContext} */ ({ waitUntil() {}, passThroughOnException() {} }),
        effectivePath: artifactCase.effectivePath,
        hasSensitiveHeaders: false,
        monitor: new PerformanceMonitor(),
        platform: artifactCase.platform,
        request,
        requestContext,
        response: new Response('artifact-data', {
          status: 200,
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': '13'
          }
        }),
        responseGeneratedLocally: false,
        url: new URL(request.url)
      });

      expect(response.headers.get('Cache-Control')).toBe(
        'public, max-age=3600, s-maxage=86400, immutable'
      );
    }
  });

  it('varies npm metadata cache keys by request origin after rewriting', () => {
    const targetA = resolveTarget(
      new URL('https://mirror-a.example/npm/pkg'),
      '/npm/pkg',
      CONFIG.PLATFORMS
    );
    const targetB = resolveTarget(
      new URL('https://mirror-b.example/npm/pkg'),
      '/npm/pkg',
      CONFIG.PLATFORMS
    );

    expect('cacheTargetUrl' in targetA && targetA.cacheTargetUrl).toContain(
      '__xget_origin=https%3A%2F%2Fmirror-a.example'
    );
    expect('cacheTargetUrl' in targetB && targetB.cacheTargetUrl).toContain(
      '__xget_origin=https%3A%2F%2Fmirror-b.example'
    );
    expect('cacheTargetUrl' in targetA && 'cacheTargetUrl' in targetB).toBe(true);
    if ('cacheTargetUrl' in targetA && 'cacheTargetUrl' in targetB) {
      expect(targetA.cacheTargetUrl).not.toBe(targetB.cacheTargetUrl);
    }
  });
});
