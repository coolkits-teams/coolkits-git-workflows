/**
 * Base error for all git-controls failures.
 *
 * `details` carries line-level context (e.g. dirty file list) that the CLI
 * renders below the main error message.
 */
export class GitControlsError extends Error {
  readonly details: string[] | undefined;

  constructor(message: string, details?: string[]) {
    super(message);
    this.name = 'GitControlsError';
    this.details = details;
  }
}
