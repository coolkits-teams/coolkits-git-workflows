/**
 * coolkit open-mr — Open the MR/PR creation page for the current branch.
 *
 * Usage:
 *   coolkit open-mr
 *   coolkit open-mr --branch feature/payment
 *   coolkit open-mr --target main
 *   coolkit open-mr --print
 */

import { loadConfig } from '../src/config/load-config.js';
import { GitControlsError } from '../src/errors.js';
import { parseCliArgs } from '../src/utils/cli-args.js';
import { createLogger } from '../src/utils/logger.js';
import { runOpenMrWorkflow } from '../src/workflows/open-mr.js';

const HELP = `
Usage: coolkit open-mr [options]

Opens the MR/PR creation URL for the current branch in your default browser.
Uses the configured MR provider (gitlab / github / none) to build the URL.

Options:
  --branch <name>   Source branch. Default: current branch.
  --target <name>   Target/base branch. Default: architecture-aware.
  --print           Print the URL only (do not open browser).
  --debug           Verbose logging.
  -h, --help        Show this help.

Examples:
  coolkit open-mr
  coolkit open-mr --target main
  coolkit open-mr --print
`.trim();

async function main(): Promise<void> {
  const { hasFlag, getFlag } = parseCliArgs(process.argv);

  if (hasFlag('--help') || hasFlag('-h')) {
    process.stdout.write(`${HELP}\n`);
    return;
  }

  const logger = createLogger({ debug: hasFlag('--debug') });
  const config = await loadConfig();

  try {
    runOpenMrWorkflow({
      config,
      logger,
      options: {
        branch: getFlag('--branch'),
        target: getFlag('--target'),
        printOnly: hasFlag('--print'),
      },
    });
  } catch (error) {
    if (error instanceof GitControlsError) {
      logger.err(error.message);
      error.details?.forEach((d) => {
        logger.err(`  ${d}`);
      });
    } else {
      logger.err(error instanceof Error ? error.message : String(error));
    }
    process.exit(1);
  }
}

void main();
