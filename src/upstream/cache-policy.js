/**
 * Xget - High-performance acceleration engine for developer resources
 * Copyright (C) Xi Xu
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { isFlatpakReferenceFilePath } from '../utils/rewrite.js';

const METADATA_EDGE_TTL_SECONDS = 60;
const MUTABLE_EDGE_TTL_SECONDS = 300;
const IMMUTABLE_EDGE_TTL_SECONDS = 86400;
const IMMUTABLE_BROWSER_TTL_SECONDS = 3600;

const IMMUTABLE_ARTIFACT_PATTERN =
  /\.(?:tgz|whl|jar|zip|gem|crate|deb|rpm|nupkg|tar\.gz|tar\.bz2|tar\.xz)(?:$|[?#])/i;

/**
 * Checks whether a request path points to versioned or content-addressed package artifacts.
 * @param {string} value Request path or target URL.
 * @returns {boolean} True when the resource can use long-lived immutable caching.
 */
export function isImmutableArtifactPath(value) {
  return IMMUTABLE_ARTIFACT_PATTERN.test(value);
}

/**
 * Checks whether an npm path points to rewritten package metadata instead of tarball content.
 * @param {string} effectivePath Normalized request path.
 * @returns {boolean} True when npm response rewriting can bind content to request origin.
 */
function isNpmMetadataPath(effectivePath) {
  return effectivePath.startsWith('/npm/') && !isImmutableArtifactPath(effectivePath);
}

/**
 * Checks whether the cache key must include the request origin because response rewriting embeds it.
 * @param {string} platform Platform key.
 * @param {string} effectivePath Normalized request path.
 * @returns {boolean} True when the generated response varies by request origin.
 */
export function shouldVaryCacheByOrigin(platform, effectivePath) {
  return (
    (platform === 'flathub' && isFlatpakReferenceFilePath(effectivePath)) ||
    (platform === 'npm' && isNpmMetadataPath(effectivePath))
  );
}

/**
 * Checks whether a request targets mutable metadata or package index resources.
 * @param {string} platform Platform key.
 * @param {string} effectivePath Normalized request path.
 * @returns {boolean} True when freshness should be preferred over hit ratio.
 */
function isMetadataOrIndexPath(platform, effectivePath) {
  if (platform === 'npm') {
    return isNpmMetadataPath(effectivePath);
  }

  if (platform === 'pypi') {
    return effectivePath.startsWith('/pypi/simple/') || effectivePath === '/pypi/simple';
  }

  if (platform === 'maven') {
    return effectivePath.endsWith('/maven-metadata.xml');
  }

  if (platform === 'flathub') {
    return (
      effectivePath === '/flathub/repo/summary' || effectivePath === '/flathub/repo/summary.sig'
    );
  }

  return false;
}

/**
 * Builds a shared-cache Cache-Control value.
 * @param {number} browserTtl Browser max-age in seconds.
 * @param {number} edgeTtl Shared cache max-age in seconds.
 * @param {boolean} immutable Whether the response is immutable.
 * @returns {string} Cache-Control header value.
 */
function buildPublicCacheControl(browserTtl, edgeTtl, immutable) {
  const directives = ['public', `max-age=${browserTtl}`, `s-maxage=${edgeTtl}`];

  if (immutable) {
    directives.push('immutable');
  } else {
    directives.push('must-revalidate');
  }

  return directives.join(', ');
}

/**
 * Resolves cache behavior for a proxied request/response.
 * @param {{
 *   canUseCache: boolean,
 *   config: import('../config/index.js').ApplicationConfig,
 *   effectivePath: string,
 *   hasOriginBoundRewrite?: boolean,
 *   hasSensitiveHeaders: boolean,
 *   platform: string,
 *   request: Request,
 *   requestContext: {
 *     isAI: boolean,
 *     isDocker: boolean,
 *     isGit: boolean,
 *     isGitLFS: boolean,
 *     isHF: boolean
 *   },
 *   targetUrl: string
 * }} options
 * @returns {{
 *   allowCacheApi: boolean,
 *   allowFetchCache: boolean,
 *   browserTtl: number,
 *   cacheControl: string,
 *   edgeTtl: number,
 *   mode: 'bypass' | 'edge' | 'private',
 *   varyByOrigin: boolean
 * }} Cache policy.
 */
export function resolveCachePolicy({
  canUseCache,
  config,
  effectivePath,
  hasOriginBoundRewrite = false,
  hasSensitiveHeaders,
  platform,
  request,
  requestContext,
  targetUrl
}) {
  const isProtocolRequest =
    requestContext.isGit ||
    requestContext.isGitLFS ||
    requestContext.isDocker ||
    requestContext.isAI ||
    requestContext.isHF;

  if (hasSensitiveHeaders) {
    return {
      allowCacheApi: false,
      allowFetchCache: false,
      browserTtl: 0,
      cacheControl: 'private, no-store',
      edgeTtl: 0,
      mode: 'private',
      varyByOrigin: false
    };
  }

  if (!canUseCache || isProtocolRequest || hasOriginBoundRewrite) {
    return {
      allowCacheApi: false,
      allowFetchCache: false,
      browserTtl: 0,
      cacheControl: 'no-store',
      edgeTtl: 0,
      mode: 'bypass',
      varyByOrigin: false
    };
  }

  if (isImmutableArtifactPath(effectivePath) || isImmutableArtifactPath(targetUrl)) {
    return {
      allowCacheApi: request.method === 'GET',
      allowFetchCache: true,
      browserTtl: IMMUTABLE_BROWSER_TTL_SECONDS,
      cacheControl: buildPublicCacheControl(
        IMMUTABLE_BROWSER_TTL_SECONDS,
        IMMUTABLE_EDGE_TTL_SECONDS,
        true
      ),
      edgeTtl: IMMUTABLE_EDGE_TTL_SECONDS,
      mode: 'edge',
      varyByOrigin: shouldVaryCacheByOrigin(platform, effectivePath)
    };
  }

  if (isMetadataOrIndexPath(platform, effectivePath)) {
    return {
      allowCacheApi: request.method === 'GET',
      allowFetchCache: true,
      browserTtl: 0,
      cacheControl: buildPublicCacheControl(0, METADATA_EDGE_TTL_SECONDS, false),
      edgeTtl: METADATA_EDGE_TTL_SECONDS,
      mode: 'edge',
      varyByOrigin: shouldVaryCacheByOrigin(platform, effectivePath)
    };
  }

  const fallbackEdgeTtl = Number.isFinite(config.CACHE_DURATION)
    ? config.CACHE_DURATION
    : MUTABLE_EDGE_TTL_SECONDS;

  return {
    allowCacheApi: request.method === 'GET',
    allowFetchCache: true,
    browserTtl: 0,
    cacheControl: buildPublicCacheControl(0, fallbackEdgeTtl, false),
    edgeTtl: fallbackEdgeTtl,
    mode: 'edge',
    varyByOrigin: shouldVaryCacheByOrigin(platform, effectivePath)
  };
}
