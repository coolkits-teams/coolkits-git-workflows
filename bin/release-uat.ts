/**
 * CLI entry point: sync root into the current feature branch, then open an MR to UAT.
 *
 * Usage:
 *   coolkit release-uat
 *   coolkit release-uat --branch feature/my-feature
 *   coolkit release-uat --dry-run
 */

import { loadConfig } from '../src/config/load-config.js';
import { GitControlsError } from '../src/errors.js';
import { parseCliArgs } from '../src/utils/cli-args.js';
import { createLogger } from '../src/utils/logger.js';
import { runReleaseUatWorkflow } from '../src/workflows/release-uat.js';

const HELP_TEXT = `
Usage: coolkit release-uat [options]

Syncs root into the current feature branch, then opens an MR to UAT.

Steps:
  1. Merges root (source-of-truth) into the feature branch.
     Stops with conflict instructions if needed — resolve, commit, re-run.
  2. Creates a safe MR branch and opens an MR: feature → UAT.

Options:
  --branch <name>   Feature branch to release. Defaults to current branch.
  --dry-run         Preview without making changes.
  --debug           Enable verbose debug logging.
  -h, --help        Show this help.
`.trim();

async function main(): Promise<void> {
  const { hasFlag, getFlag } = parseCliArgs(process.argv);

  if (hasFlag('--help') || hasFlag('-h')) {
    process.stdout.write(`${HELP_TEXT}\n`);
    return;
  }

  const logger = createLogger({ debug: hasFlag('--debug') });
  const config = await loadConfig();

  try {
    runReleaseUatWorkflow({
      config,
      logger,
      options: {
        branch: getFlag('--branch'),
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
