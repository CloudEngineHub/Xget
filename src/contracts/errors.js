/** A stable, safe-to-print error for automation clients. */
export class ContractError extends Error {
  /**
   * Creates a contract error without embedding the rejected input.
   * @param {string} code
   * @param {string} message
   * @param {number} exitCode
   */
  constructor(code, message, exitCode = 2) {
    super(message);
    this.name = 'ContractError';
    this.code = code;
    this.exitCode = exitCode;
  }
}
