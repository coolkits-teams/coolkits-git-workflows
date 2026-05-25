/**
 * CLI entry point: merge the integration (root) branch into the current feature branch.
 *
 * Usage (after `npm install -g @coolkits/git-workflows`):
 *   git-sync-from-root
 *   git-sync-from-root --branch feature/product
 *   git-sync-from-root --no-push
 *   git-sync-from-root --debug
 *   git-sync-from-root --help
 *
 * Usage (via npx, no install needed):
 *   npx @coolkits/git-workflows git-sync-from-root
 */

import { loadConfig } from '../src/config/load-config.js';
import { GitControlsError } from '../src/errors.js';
import { parseCliArgs } from '../src/utils/cli-args.js';
import { createLogger } from '../src/utils/logger.js';
import { runSyncFromRootWorkflow } from '../src/workflows/sync-from-root.js';

const HELP_TEXT = `
Usage: git-sync-from-root [options]

Options:
  --branch <name>   Target branch. Defaults to the current branch.
  --no-push         Merge locally without pushing.
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
    runSyncFromRootWorkflow({
      config,
      logger,
      options: {
        branch: getFlag('--branch'),
        skipPush: hasFlag('--no-push'),
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
