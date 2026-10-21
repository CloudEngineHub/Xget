import { chmod, copyFile, cp, mkdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { RELEASE_VERSION } from '../src/contracts/version.js';

const root = new URL('../', import.meta.url);
const cliRoot = new URL('packages/cli/', root);
const manifest = JSON.parse(await readFile(new URL('package.json', cliRoot), 'utf8'));
if (manifest.version !== RELEASE_VERSION) {
  throw new Error('CLI package version must match src/contracts/version.js RELEASE_VERSION.');
}

const sharedRoot = new URL('shared/', cliRoot);
await rm(sharedRoot, { recursive: true, force: true });
for (const directory of ['contracts', 'config', 'routing']) {
  await mkdir(new URL(`${directory}/`, sharedRoot), { recursive: true });
}
await cp(new URL('src/contracts/', root), new URL('contracts/', sharedRoot), { recursive: true });
for (const file of [
  'config/platform-catalog.js',
  'routing/platform-index.js',
  'routing/platform-transformers.js',
  'routing/registry-path.js'
]) {
  await copyFile(new URL(`src/${file}`, root), new URL(file, sharedRoot));
}
await copyFile(new URL('LICENSE', root), new URL('LICENSE', cliRoot));
await chmod(new URL('bin/xget.js', cliRoot), 0o755);
process.stdout.write(`Built offline CLI ${manifest.version} at ${fileURLToPath(cliRoot)}\n`);
