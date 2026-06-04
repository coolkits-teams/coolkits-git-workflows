/**
 * CLI entry point: merge main into the current feature branch.
 *
 * Usage:
 *   coolkit sync-from-main
 *   coolkit sync-from-main --branch feature/product
 *   coolkit sync-from-main --no-push
 *
 * Alias: coolkit sync-from-root (deprecated)
 */

import { loadConfig } from '../src/config/load-config.js';
import { GitControlsError } from '../src/errors.js';
import { parseCliArgs } from '../src/utils/cli-args.js';
import { createLogger } from '../src/utils/logger.js';
import { runSyncFromRootWorkflow } from '../src/workflows/sync-from-root.js';

const HELP_TEXT = `
Usage: coolkit sync-from-main [options]

Merges root into your feature branch. On conflict, files belonging to OTHER features
are auto-resolved by keeping root (the source of truth); your own feature files and
shared/common files are left for you to resolve. Nothing is committed or pushed when
conflicts occur.

Options:
  --feature <name>  Feature branch to sync. Defaults to the current branch.
  --branch <name>   Alias of --feature.
  --manual          Disable auto-resolution; leave every conflict for manual fixing.
  --no-push         On a clean merge, merge locally without pushing.
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
        feature: getFlag('--feature'),
        branch: getFlag('--branch'),
        skipPush: hasFlag('--no-push'),
        manual: hasFlag('--manual'),
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
