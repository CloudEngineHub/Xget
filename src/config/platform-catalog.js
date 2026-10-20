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
 * Conversion and routing metadata share the same source as upstream addresses.
 * `matchPathPrefix` selects upstream resources on a path boundary; `stripPathPrefix`
 * is removed when constructing the corresponding Xget route.
 * @typedef {object} PlatformConversion
 * @property {string} rule Name of the shared path transformation rule.
 * @property {string} matchPathPrefix Upstream path prefix accepted on a segment boundary.
 * @property {string} stripPathPrefix Upstream prefix removed to form the Xget route.
 * @property {boolean} rootRoute Whether the platform root serves a resource rather than redirects.
 * @property {string[]} [normalizationAliases] Explicit upstream shorthand paths safe to canonicalize.
 */

/**
 * Describes one routable platform without implying support for every upstream operation.
 * @typedef {object} PlatformDefinition
 * @property {string} upstream Canonical upstream base address.
 * @property {string} category Resource family used by clients for discovery.
 * @property {PlatformConversion} conversion Offline conversion and routing rules.
 */

/**
 * Creates a platform description with reversible prefix conversion by default.
 * @param {string} upstream
 * @param {string} category
 * @param {Partial<PlatformConversion>} conversion
 * @returns {PlatformDefinition} Complete platform definition.
 */
function definePlatform(upstream, category, conversion = {}) {
  const upstreamPath = new URL(upstream).pathname.replace(/\/$/, '');
  return {
    upstream,
    category,
    conversion: {
      rule: 'prefix',
      matchPathPrefix: upstreamPath,
      stripPathPrefix: upstreamPath,
      rootRoute: false,
      ...conversion
    }
  };
}

/** @type {Record<string, PlatformDefinition>} */
export const PLATFORM_DEFINITIONS = {
  // Code Repositories & Version Control
  gh: definePlatform('https://github.com', 'code'),
  gist: definePlatform('https://gist.github.com', 'code'),
  gl: definePlatform('https://gitlab.com', 'code'),
  gitea: definePlatform('https://gitea.com', 'code'),
  codeberg: definePlatform('https://codeberg.org', 'code'),
  sf: definePlatform('https://sourceforge.net', 'code'),
  aosp: definePlatform('https://android.googlesource.com', 'code'),
  hf: definePlatform('https://huggingface.co', 'code'),
  civitai: definePlatform('https://civitai.com', 'code'),

  // Package Managers
  npm: definePlatform('https://registry.npmjs.org', 'package'),
  pypi: definePlatform('https://pypi.org', 'package'),
  'pypi-files': definePlatform('https://files.pythonhosted.org', 'package'),
  conda: definePlatform('https://repo.anaconda.com', 'package'),
  'conda-community': definePlatform('https://conda.anaconda.org', 'package'),
  maven: definePlatform('https://repo1.maven.org', 'package'),
  apache: definePlatform('https://downloads.apache.org', 'package'),
  gradle: definePlatform('https://plugins.gradle.org', 'package'),
  homebrew: definePlatform('https://github.com/Homebrew', 'package'),
  'homebrew-api': definePlatform('https://formulae.brew.sh/api', 'package'),
  'homebrew-bottles': definePlatform('https://ghcr.io', 'package', {
    matchPathPrefix: '/v2/homebrew'
  }),
  rubygems: definePlatform('https://rubygems.org', 'package'),
  cran: definePlatform('https://cran.r-project.org', 'package'),
  cpan: definePlatform('https://www.cpan.org', 'package'),
  ctan: definePlatform('https://tug.ctan.org', 'package'),
  golang: definePlatform('https://proxy.golang.org', 'package'),
  nuget: definePlatform('https://api.nuget.org', 'package'),
  crates: definePlatform('https://crates.io', 'package', {
    rule: 'crates-api',
    matchPathPrefix: '/api/v1/crates',
    stripPathPrefix: '/api/v1/crates',
    rootRoute: true
  }),
  packagist: definePlatform('https://repo.packagist.org', 'package'),
  flathub: definePlatform('https://dl.flathub.org', 'package'),

  // Linux Distributions
  debian: definePlatform('https://deb.debian.org', 'linux'),
  ubuntu: definePlatform('https://archive.ubuntu.com', 'linux'),
  fedora: definePlatform('https://mirrors.kernel.org/fedora', 'linux', { rule: 'fedora-mirror' }),
  rocky: definePlatform('https://download.rockylinux.org', 'linux'),
  opensuse: definePlatform('https://download.opensuse.org', 'linux'),
  arch: definePlatform('https://geo.mirror.pkgbuild.com', 'linux'),

  // Other Resources
  arxiv: definePlatform('https://arxiv.org', 'resource'),
  fdroid: definePlatform('https://f-droid.org', 'resource'),
  jenkins: definePlatform('https://updates.jenkins.io', 'resource', {
    rule: 'jenkins-current',
    normalizationAliases: ['/update-center.json', '/update-center.actual.json']
  }),

  // AI Inference Providers
  'ip-openai': definePlatform('https://api.openai.com', 'ai'),
  'ip-anthropic': definePlatform('https://api.anthropic.com', 'ai'),
  'ip-gemini': definePlatform('https://generativelanguage.googleapis.com', 'ai'),
  'ip-vertexai': definePlatform('https://aiplatform.googleapis.com', 'ai'),
  'ip-cohere': definePlatform('https://api.cohere.ai', 'ai'),
  'ip-mistralai': definePlatform('https://api.mistral.ai', 'ai'),
  'ip-xai': definePlatform('https://api.x.ai', 'ai'),
  'ip-githubmodels': definePlatform('https://models.github.ai', 'ai'),
  'ip-nvidiaapi': definePlatform('https://integrate.api.nvidia.com', 'ai'),
  'ip-perplexity': definePlatform('https://api.perplexity.ai', 'ai'),
  'ip-braintrust': definePlatform('https://api.braintrust.dev', 'ai'),
  'ip-groq': definePlatform('https://api.groq.com', 'ai'),
  'ip-cerebras': definePlatform('https://api.cerebras.ai', 'ai'),
  'ip-sambanova': definePlatform('https://api.sambanova.ai', 'ai'),
  'ip-siray': definePlatform('https://api.siray.ai', 'ai'),
  'ip-huggingface': definePlatform('https://router.huggingface.co', 'ai'),
  'ip-together': definePlatform('https://api.together.xyz', 'ai'),
  'ip-replicate': definePlatform('https://api.replicate.com', 'ai'),
  'ip-fireworks': definePlatform('https://api.fireworks.ai', 'ai'),
  'ip-nebius': definePlatform('https://api.studio.nebius.ai', 'ai'),
  'ip-jina': definePlatform('https://api.jina.ai', 'ai'),
  'ip-voyageai': definePlatform('https://api.voyageai.com', 'ai'),
  'ip-falai': definePlatform('https://fal.run', 'ai'),
  'ip-novita': definePlatform('https://api.novita.ai', 'ai'),
  'ip-burncloud': definePlatform('https://ai.burncloud.com', 'ai'),
  'ip-openrouter': definePlatform('https://openrouter.ai', 'ai'),
  'ip-poe': definePlatform('https://api.poe.com', 'ai'),
  'ip-featherlessai': definePlatform('https://api.featherless.ai', 'ai'),
  'ip-hyperbolic': definePlatform('https://api.hyperbolic.xyz', 'ai'),

  // Container Registries
  'cr-docker': definePlatform('https://registry-1.docker.io', 'container', {
    rule: 'docker-library'
  }),
  'cr-quay': definePlatform('https://quay.io', 'container'),
  'cr-gcr': definePlatform('https://gcr.io', 'container'),
  'cr-mcr': definePlatform('https://mcr.microsoft.com', 'container'),
  'cr-ecr': definePlatform('https://public.ecr.aws', 'container'),
  'cr-ghcr': definePlatform('https://ghcr.io', 'container'),
  'cr-gitlab': definePlatform('https://registry.gitlab.com', 'container'),
  'cr-redhat': definePlatform('https://registry.redhat.io', 'container'),
  'cr-oracle': definePlatform('https://container-registry.oracle.com', 'container'),
  'cr-cloudsmith': definePlatform('https://docker.cloudsmith.io', 'container'),
  'cr-digitalocean': definePlatform('https://registry.digitalocean.com', 'container'),
  'cr-vmware': definePlatform('https://projects.registry.vmware.com', 'container'),
  'cr-k8s': definePlatform('https://registry.k8s.io', 'container'),
  'cr-heroku': definePlatform('https://registry.heroku.com', 'container'),
  'cr-suse': definePlatform('https://registry.suse.com', 'container'),
  'cr-opensuse': definePlatform('https://registry.opensuse.org', 'container'),
  'cr-gitpod': definePlatform('https://registry.gitpod.io', 'container')
};

/**
 * Compatibility mapping used by existing runtime configuration and integrations.
 * @type {Record<string, string>}
 */
export const PLATFORM_CATALOG = Object.fromEntries(
  Object.entries(PLATFORM_DEFINITIONS).map(([key, definition]) => [key, definition.upstream])
);

export const PLATFORMS = PLATFORM_CATALOG;
