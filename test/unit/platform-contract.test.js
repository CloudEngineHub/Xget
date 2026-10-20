import { describe, expect, it } from 'vitest';
import { PLATFORM_CATALOG } from '../../src/config/platform-catalog.js';
import {
  CATALOG_VERSION,
  ContractError,
  getPlatformManifest,
  RELEASE_VERSION,
  resolveUrl,
  SCHEMA_VERSION
} from '../../src/contracts/index.js';
import { getPlatformPathPrefix, matchPlatformPath } from '../../src/routing/platform-index.js';
import { resolveTarget } from '../../src/routing/resolve-target.js';

const baseUrl = 'https://xget.example';

describe('Versioned platform contract', () => {
  it('describes all routes and makes only routing and conversion capability claims', () => {
    const manifest = getPlatformManifest();
    expect(manifest).toMatchObject({
      schemaVersion: SCHEMA_VERSION,
      catalogVersion: CATALOG_VERSION,
      releaseVersion: RELEASE_VERSION,
      capabilities: ['routing', 'url-conversion']
    });
    expect(manifest.platforms.map(platform => platform.key)).toEqual(Object.keys(PLATFORM_CATALOG));
    for (const platform of manifest.platforms) {
      expect(platform.upstream).toBe(PLATFORM_CATALOG[platform.key]);
      expect(platform.pathPrefix).toBe(getPlatformPathPrefix(platform.key));
      expect(platform.category).toBeTruthy();
      expect(platform.conversion.rule).toBeTruthy();
      expect(platform).not.toHaveProperty('verifiedOperations');
    }
  });

  it('does not expose the mutable routing descriptions to callers', () => {
    const manifest = getPlatformManifest();
    manifest.platforms[0].conversion.rule = 'changed-by-client';
    manifest.platforms[0].upstream = 'https://untrusted.example';
    expect(getPlatformManifest().platforms[0].conversion.rule).toBe('prefix');
    expect(getPlatformManifest().platforms[0].upstream).toBe(PLATFORM_CATALOG.gh);
  });

  it.each([
    ['https://github.com/org/repo.git', 'gh', '/gh/org/repo.git'],
    ['https://github.com/Homebrew/brew', 'homebrew', '/homebrew/brew'],
    ['https://github.com/Homebrewer/repo', 'gh', '/gh/Homebrewer/repo'],
    [
      'https://formulae.brew.sh/api/formula/git.json',
      'homebrew-api',
      '/homebrew/api/formula/git.json'
    ],
    [
      'https://ghcr.io/v2/homebrew/core/git/manifests/latest',
      'homebrew-bottles',
      '/homebrew/bottles/v2/homebrew/core/git/manifests/latest'
    ],
    [
      'https://ghcr.io/v2/homebrewer/git/manifests/latest',
      'cr-ghcr',
      '/cr/ghcr/v2/homebrewer/git/manifests/latest'
    ],
    [
      'https://ghcr.io/v2/org/image/manifests/latest',
      'cr-ghcr',
      '/cr/ghcr/v2/org/image/manifests/latest'
    ],
    [
      'https://crates.io/api/v1/crates/serde/1.0.0/download',
      'crates',
      '/crates/serde/1.0.0/download'
    ],
    ['https://crates.io/api/v1/crates?q=serde', 'crates', '/crates/?q=serde'],
    [
      'https://updates.jenkins.io/current/update-center.json',
      'jenkins',
      '/jenkins/current/update-center.json'
    ],
    [
      'https://mirrors.kernel.org/fedora/releases/43/repodata/repomd.xml',
      'fedora',
      '/fedora/releases/43/repodata/repomd.xml'
    ],
    [
      'https://registry-1.docker.io/v2/library/alpine/manifests/latest',
      'cr-docker',
      '/cr/docker/v2/library/alpine/manifests/latest'
    ],
    [
      'https://files.pythonhosted.org/packages/pkg.whl',
      'pypi-files',
      '/pypi/files/packages/pkg.whl'
    ]
  ])('round-trips %s through Worker routing', (input, key, convertedPath) => {
    const result = resolveUrl(input, baseUrl);
    expect(result.platform.key).toBe(key);
    expect(result.convertedUrl).toBe(`${baseUrl}${convertedPath}`);
    expect(result.upstreamUrl).toBe(input);
    const converted = new URL(result.convertedUrl);
    const routed = resolveTarget(converted, converted.pathname, PLATFORM_CATALOG);
    expect(routed).not.toHaveProperty('response');
    if ('targetUrl' in routed) {
      expect(routed.targetUrl).toBe(input);
      expect(routed.platform).toBe(key);
    }
  });

  it('converts a representative resource for every catalog entry', () => {
    for (const platform of getPlatformManifest().platforms) {
      const input =
        platform.key === 'crates'
          ? 'https://crates.io/api/v1/crates/serde'
          : platform.key === 'homebrew-bottles'
            ? 'https://ghcr.io/v2/homebrew/core/git/manifests/latest'
            : platform.key === 'jenkins'
              ? `${platform.upstream}/current/update-center.json`
              : platform.key === 'cr-ghcr'
                ? `${platform.upstream}/v2/org/image/manifests/latest`
                : `${platform.upstream}/resource/file`;
      const result = resolveUrl(input, baseUrl);
      expect(result.platform.key).toBe(platform.key);
      expect(result.upstreamUrl).toBe(input);
    }
  });

  it('preserves encoded paths, query values, and fragments', () => {
    const input = 'https://github.com/org/repo/releases/a%20b?token=secret%2Fvalue&x=1#section';
    const result = resolveUrl(input, `${baseUrl}/`);
    expect(result.convertedUrl).toBe(
      `${baseUrl}/gh/org/repo/releases/a%20b?token=secret%2Fvalue&x=1#section`
    );
    expect(result.upstreamUrl).toBe(input);
    expect(result.baseUrl).toBe(baseUrl);
  });

  it('explicitly discloses Jenkins current-path normalization', () => {
    const input = 'https://updates.jenkins.io/update-center.json?version=2.4#data';
    const result = resolveUrl(input, baseUrl);
    expect(result).toMatchObject({
      upstreamUrl: 'https://updates.jenkins.io/current/update-center.json?version=2.4#data',
      convertedUrl: `${baseUrl}/jenkins/update-center.json?version=2.4#data`,
      normalization: { code: 'JENKINS_CURRENT_PATH', inputUrl: input }
    });
  });

  it.each([
    'https://github.com.evil.example/org/repo',
    'https://github.com:444/org/repo',
    'http://github.com/org/repo'
  ])('rejects unsupported origin and path boundaries: %s', input => {
    expect(() => resolveUrl(input, baseUrl)).toThrowError(
      expect.objectContaining({ code: 'UNSUPPORTED_URL', exitCode: 3 })
    );
  });

  it.each([
    'https://formulae.brew.sh/apiculture/file',
    'https://crates.io/api/v1/crates-other/serde',
    'https://crates.io/crates/serde',
    'https://github.com/',
    'https://mirrors.kernel.org/fedora/pub/fedora/linux/releases/file',
    'https://registry-1.docker.io/v2/alpine/manifests/latest',
    'https://updates.jenkins.io/stable/update-center.json',
    'https://updates.jenkins.io/unknown-path',
    'https://github.com/Homebrew/api/formula.json',
    'https://crates.io/api/v1/crates/'
  ])('rejects URLs whose route would address another resource: %s', input => {
    expect(() => resolveUrl(input, baseUrl)).toThrowError(
      expect.objectContaining({ code: 'UNSUPPORTED_CONVERSION', exitCode: 3 })
    );
  });

  it.each([
    'relative/path',
    'ftp://github.com/org/repo',
    'https://user:secret@github.com/org/repo?token=secret',
    'https://@github.com/org/repo',
    'https://github.com\\org/repo',
    ' https://github.com/org/repo',
    'https://github.com/org/\nrepo'
  ])('rejects malformed or credential-bearing input: %s', input => {
    expect(() => resolveUrl(input, baseUrl)).toThrowError(
      expect.objectContaining({ code: 'INVALID_URL', exitCode: 2 })
    );
  });

  it.each([
    'xget.example',
    'file:///tmp/xget',
    'https://user:secret@xget.example',
    'https://@xget.example',
    'https://xget.example/prefix',
    'https://xget.example/?token=secret',
    'https://xget.example/?',
    'https://xget.example/#',
    'https://xget.example/#secret'
  ])('requires an HTTP origin as the instance base: %s', base => {
    expect(() => resolveUrl('https://github.com/org/repo', base)).toThrowError(
      expect.objectContaining({ code: 'INVALID_BASE_URL', exitCode: 2 })
    );
  });

  it('never embeds rejected input in printable contract errors', () => {
    for (const input of [
      'https://secret:secret@github.com/org/repo',
      'https://unsupported.example/path?token=secret'
    ]) {
      try {
        resolveUrl(input, baseUrl);
        throw new Error('Expected a contract error');
      } catch (error) {
        expect(error).toBeInstanceOf(ContractError);
        expect(String(error)).not.toContain('secret');
      }
    }
  });

  it('uses complete platform path segments and longest matching prefixes', () => {
    expect(matchPlatformPath('/pypi/files/packages/file.whl')).toBe('pypi-files');
    expect(matchPlatformPath('/pypi/filesx/simple')).toBe('pypi');
    expect(matchPlatformPath('/ghx/org/repo')).toBeUndefined();
    expect(matchPlatformPath('/ip/openai/v1/models')).toBe('ip-openai');
  });
});
