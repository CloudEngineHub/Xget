import { addSecurityHeaders } from '../utils/security.js';
import { getPlatformManifest } from '../contracts/platforms.js';
import { CATALOG_VERSION, RELEASE_VERSION, SCHEMA_VERSION } from '../contracts/version.js';

/**
 * Returns local capability metadata, without cache lookup or upstream network I/O.
 * @param {Request} request
 * @returns {Response} Manifest or a versioned method error.
 */
export function createDiscoveryResponse(request) {
  const allowed = request.method === 'GET' || request.method === 'HEAD';
  const body = allowed
    ? getPlatformManifest()
    : {
        schemaVersion: SCHEMA_VERSION,
        catalogVersion: CATALOG_VERSION,
        releaseVersion: RELEASE_VERSION,
        error: { code: 'METHOD_NOT_ALLOWED', message: 'Discovery supports GET and HEAD only.' }
      };
  const headers = addSecurityHeaders(
    new Headers({ 'Content-Type': 'application/json; charset=utf-8', Allow: 'GET, HEAD' })
  );
  return new Response(request.method === 'HEAD' ? null : JSON.stringify(body), {
    status: allowed ? 200 : 405,
    headers
  });
}
