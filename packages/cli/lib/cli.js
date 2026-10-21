import {
  CATALOG_VERSION,
  ContractError,
  getPlatformManifest,
  RELEASE_VERSION,
  resolveUrl,
  SCHEMA_VERSION
} from '../shared/contracts/index.js';

export const CLI_VERSION = RELEASE_VERSION;

const HELP = `Usage: xget <command> [options]

Commands:
  capabilities              List the bundled platform and conversion contract.
  resolve <URL>             Convert an upstream HTTP(S) URL without network access.
  version                   Show CLI and contract versions.
  help                      Show this help.

Options:
  --base-url URL            Root Xget instance URL; otherwise XGET_BASE_URL.
  --format json|text|table   JSON by default; table is for capabilities only.
  --json                    Alias for --format json.
  --help                    Show help.
  --version                 Alias for version.

Compatibility aliases:
  platforms                 Alias for capabilities.
  convert --url URL         Alias for resolve <URL>.

All commands use the bundled catalog. No requests are made to the instance,
upstream, repository source, or README. Conversion does not verify availability.
`;

/**
 * @typedef {{command: string, positionals: string[], options: Record<string, string | boolean>}} Arguments
 */

/**
 * Parses strict, shell-independent CLI arguments without interpreting their contents.
 * @param {string[]} argv
 * @returns {Arguments} Validated options and positional arguments.
 */
function parseArguments(argv) {
  /** @type {Record<string, string | boolean>} */
  const options = {};
  const positionals = [];
  const booleanOptions = new Set(['json', 'help', 'version']);
  const valueOptions = new Set(['base-url', 'url', 'format']);

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('-')) {
      positionals.push(token);
      continue;
    }

    if (!token.startsWith('--') || token === '--') {
      throw new ContractError('UNKNOWN_OPTION', 'Unknown option. Use --help for options.', 2);
    }

    const separator = token.indexOf('=');
    const key = token.slice(2, separator === -1 ? undefined : separator);
    if (!booleanOptions.has(key) && !valueOptions.has(key)) {
      throw new ContractError('UNKNOWN_OPTION', 'Unknown option. Use --help for options.', 2);
    }
    if (Object.hasOwn(options, key)) {
      throw new ContractError('INVALID_ARGUMENT', 'Options must not be repeated.', 2);
    }

    if (booleanOptions.has(key)) {
      if (separator !== -1) {
        throw new ContractError('INVALID_ARGUMENT', 'Boolean options take no value.', 2);
      }
      options[key] = true;
      continue;
    }

    const value = separator === -1 ? argv[++index] : token.slice(separator + 1);
    if (!value || value.startsWith('--')) {
      throw new ContractError('INVALID_ARGUMENT', `Missing value for --${key}.`, 2);
    }
    options[key] = value;
  }

  if (options.json && options.format) {
    throw new ContractError('INVALID_ARGUMENT', 'Use --json or --format, not both.', 2);
  }

  const command = positionals.shift() || 'help';
  return { command, positionals, options };
}

/**
 * Selects error output even when argument parsing fails.
 * @param {string[]} argv
 * @returns {string} Requested error output format.
 */
function errorFormat(argv) {
  if (argv.includes('--json')) {
    return 'json';
  }
  const inline = argv.find(token => token.startsWith('--format='));
  const index = argv.indexOf('--format');
  return (inline?.slice('--format='.length) || (index >= 0 ? argv[index + 1] : 'json')) === 'text'
    ? 'text'
    : 'json';
}

/**
 * Builds the stable envelope shared by every JSON response.
 * @param {Record<string, unknown>} result
 * @returns {Record<string, unknown>} Versioned response envelope.
 */
function envelope(result) {
  return {
    schemaVersion: SCHEMA_VERSION,
    cliVersion: CLI_VERSION,
    catalogVersion: CATALOG_VERSION,
    ...result
  };
}

/**
 * Runs the offline CLI. Streams and environment can be injected by callers.
 * @param {string[]} argv
 * @param {{env?: Record<string, string | undefined>, stdout?: {write: (chunk: string) => unknown}, stderr?: {write: (chunk: string) => unknown}}} [context]
 * @returns {number} Process exit code.
 */
export function runCli(argv, context = {}) {
  const env = context.env ?? process.env;
  const stdout = context.stdout ?? process.stdout;
  const stderr = context.stderr ?? process.stderr;
  let format = errorFormat(argv);

  try {
    const { command: inputCommand, positionals, options } = parseArguments(argv);
    format = typeof options.format === 'string' ? options.format : 'json';
    if (!['json', 'text', 'table'].includes(format)) {
      throw new ContractError('INVALID_ARGUMENT', 'Use --format json, text, or table.', 2);
    }

    const aliases = /** @type {Record<string, string>} */ ({
      platforms: 'capabilities',
      convert: 'resolve'
    });
    const command = options.help
      ? 'help'
      : options.version
        ? 'version'
        : (aliases[inputCommand] ?? inputCommand);
    if (!['help', 'version', 'capabilities', 'resolve'].includes(command)) {
      throw new ContractError('UNKNOWN_COMMAND', 'Unknown command. Use --help for commands.', 2);
    }
    if (format === 'table' && command !== 'capabilities') {
      throw new ContractError('INVALID_ARGUMENT', 'Table output is for capabilities only.', 2);
    }
    if (command !== 'resolve' && (options.url || options['base-url'])) {
      throw new ContractError('INVALID_ARGUMENT', 'URL options are for resolve only.', 2);
    }
    if (positionals.length > (command === 'resolve' ? 1 : 0)) {
      throw new ContractError('INVALID_ARGUMENT', 'Unexpected positional arguments.', 2);
    }

    if (command === 'help') {
      if (options.json || options.format === 'json') {
        stdout.write(`${JSON.stringify(envelope({ ok: true, data: { help: HELP } }), null, 2)}\n`);
      } else {
        stdout.write(HELP);
      }
      return 0;
    }

    /** @type {Record<string, unknown>} */
    let data;
    if (command === 'version') {
      data = {
        cliVersion: CLI_VERSION,
        schemaVersion: SCHEMA_VERSION,
        catalogVersion: CATALOG_VERSION,
        releaseVersion: RELEASE_VERSION
      };
    } else if (command === 'capabilities') {
      data = { source: 'bundled', ...getPlatformManifest() };
    } else {
      if (positionals.length && options.url) {
        throw new ContractError(
          'INVALID_ARGUMENT',
          'Supply a positional URL or --url, not both.',
          2
        );
      }
      const inputUrl = positionals[0] || options.url;
      if (typeof inputUrl !== 'string' || !inputUrl) {
        throw new ContractError('INVALID_ARGUMENT', 'A URL is required for resolve.', 2);
      }
      const baseUrl = options['base-url'] ?? env.XGET_BASE_URL;
      if (typeof baseUrl !== 'string' || !baseUrl) {
        throw new ContractError(
          'MISSING_BASE_URL',
          'Supply --base-url or set XGET_BASE_URL to your Xget instance root URL.',
          2
        );
      }
      data = { source: 'bundled', ...resolveUrl(inputUrl, baseUrl) };
    }

    if (format === 'json') {
      stdout.write(`${JSON.stringify(envelope({ ok: true, data }), null, 2)}\n`);
    } else if (command === 'capabilities') {
      const { platforms } = getPlatformManifest();
      if (format === 'table') {
        stdout.write('key\tcategory\tpathPrefix\tupstream\n');
      }
      for (const platform of platforms) {
        stdout.write(
          `${platform.key}\t${platform.category}\t${platform.pathPrefix}\t${platform.upstream}\n`
        );
      }
    } else {
      stdout.write(`${command === 'resolve' ? data.convertedUrl : CLI_VERSION}\n`);
    }
    return 0;
  } catch (error) {
    const failure =
      error instanceof ContractError
        ? error
        : new ContractError('INTERNAL_ERROR', 'An internal CLI error occurred.', 1);
    if (format === 'text') {
      stderr.write(`${failure.code}: ${failure.message}\n`);
    } else {
      stdout.write(
        `${JSON.stringify(envelope({ ok: false, error: { code: failure.code, message: failure.message } }), null, 2)}\n`
      );
    }
    return failure.exitCode;
  }
}
