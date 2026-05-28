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
  --branch <name>     Feature branch to extract from. Default: current branch.
  --desc <text>       Short description for common branch slug (e.g. fix-validator-null-check).
  --ticket <id>       Ticket id for commit message (e.g. PROJ-123).
  --scope <scope>     Commit scope (default: desc slug or branch name).
  --type <type>       Commit type: feat, fix, chore, … (default: from config).
  --dry-run           Preview without creating a branch.
  --no-mr             Push common branch but skip merge request.
  --debug             Verbose logging.
  -h, --help          Show this help.
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
        desc: getFlag('--desc'),
        ticketId: getFlag('--ticket'),
        scope: getFlag('--scope'),
        type: getFlag('--type'),
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
