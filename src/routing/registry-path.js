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

/**
 * Normalizes Docker Hub official images to the canonical library namespace.
 * @param {string} platformKey
 * @param {string} repoPath
 * @returns {string} Normalized upstream repository path.
 */
export function normalizeRepoPath(platformKey, repoPath) {
  if (platformKey === 'cr-docker' && repoPath && !repoPath.includes('/')) {
    return `library/${repoPath}`;
  }

  return repoPath;
}

/**
 * Extracts the repository path from a Docker registry API path.
 * @param {string} apiPath
 * @returns {string} Repository path without the `/v2/` prefix or operation suffix.
 */
export function extractRepositoryPath(apiPath) {
  const normalizedPath = apiPath.startsWith('/v2/')
    ? apiPath.slice(4)
    : apiPath.replace(/^\/+/, '');
  const pathParts = normalizedPath.split('/').filter(Boolean);

  if (pathParts.length === 0 || pathParts[0].startsWith('_')) {
    return '';
  }

  const suffixIndex = pathParts.findIndex(part =>
    ['manifests', 'blobs', 'tags', 'referrers'].includes(part)
  );

  if (suffixIndex <= 0) {
    return '';
  }

  return pathParts.slice(0, suffixIndex).join('/');
}

/**
 * Normalizes a Docker registry API path for upstream compatibility.
 * @param {string} platformKey
 * @param {string} apiPath
 * @returns {string} Upstream API path with any registry-specific normalization applied.
 */
export function normalizeRegistryApiPath(platformKey, apiPath) {
  if (platformKey !== 'cr-docker' || !apiPath.startsWith('/v2/')) {
    return apiPath;
  }

  const repoPath = extractRepositoryPath(apiPath);
  const normalizedRepoPath = normalizeRepoPath(platformKey, repoPath);

  if (!repoPath || normalizedRepoPath === repoPath) {
    return apiPath;
  }

  return apiPath.replace(`/v2/${repoPath}`, `/v2/${normalizedRepoPath}`);
}
