/**
 * CLI entry point: sync UAT back into root after a successful UAT release.
 *
 * Usage:
 *   coolkit final-release-sync
 *   coolkit final-release-sync --dry-run
 */

import { loadConfig } from '../src/config/load-config.js';
import { GitControlsError } from '../src/errors.js';
import { parseCliArgs } from '../src/utils/cli-args.js';
import { createLogger } from '../src/utils/logger.js';
import { runFinalReleaseSyncWorkflow } from '../src/workflows/final-release-sync.js';

const HELP_TEXT = `
Usage: coolkit final-release-sync [options]

Syncs UAT into root after a successful UAT release.

Both UAT and root are protected branches, so this command:
  1. Creates a safe MR branch based on root.
  2. Merges UAT into it locally.
     Stops with conflict instructions if needed — resolve, commit, push, then
     open the MR manually (the command prints the URL).
  3. If clean: pushes the MR branch and opens the MR into root automatically.

Options:
  --dry-run   Preview without making changes.
  --debug     Enable verbose debug logging.
  -h, --help  Show this help.
`.trim();

async function main(): Promise<void> {
  const { hasFlag } = parseCliArgs(process.argv);

  if (hasFlag('--help') || hasFlag('-h')) {
    process.stdout.write(`${HELP_TEXT}\n`);
    return;
  }

  const logger = createLogger({ debug: hasFlag('--debug') });
  const config = await loadConfig();

  try {
    runFinalReleaseSyncWorkflow({
      config,
      logger,
      options: {
        dryRun: hasFlag('--dry-run'),
      },
    });
  } catch (error) {
    if (error instanceof GitControlsError) {
      logger.err(error.message);
      error.details?.forEach((line) => {
        logger.err(`  ${line}`);
      });
    } else if (error instanceof Error) {
      logger.err(error.message);
    } else {
      logger.err(String(error));
    }
    process.exit(1);
  }
}

void main();
