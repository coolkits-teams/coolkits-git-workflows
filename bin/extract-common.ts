/**
 * CLI entry point: extract common changes into a dedicated branch and open a
 * merge request against the integration (root) branch.
 *
 * Usage (after `npm install -g @coolkits/git-workflows`):
 *   git-extract-common
 *   git-extract-common --branch feature/product
 *   git-extract-common --dry-run
 *   git-extract-common --no-mr
 *   git-extract-common --debug
 *   git-extract-common --help
 *
 * Usage (via npx, no install needed):
 *   npx @coolkits/git-workflows git-extract-common
 */

import { loadConfig } from '../src/config/load-config.js';
import { GitControlsError } from '../src/errors.js';
import { parseCliArgs } from '../src/utils/cli-args.js';
import { createLogger } from '../src/utils/logger.js';
import { runExtractCommonWorkflow } from '../src/workflows/extract-common.js';

const HELP_TEXT = `
Usage: git-extract-common [options]

Options:
  --branch <name>   Target branch. Defaults to the current branch.
  --dry-run         Preview the operation without creating any branch.
  --no-mr           Push the common branch but do not open a merge request.
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
    runExtractCommonWorkflow({
      config,
      logger,
      options: {
        branch: getFlag('--branch'),
        dryRun: hasFlag('--dry-run'),
        skipMergeRequest: hasFlag('--no-mr'),
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
