/**
 * coolkit clear-branches — Delete accumulated local feature branches.
 *
 * Usage:
 *   coolkit clear-branches
 *   coolkit clear-branches --dry-run
 *   coolkit clear-branches --all
 *   coolkit clear-branches --base root
 */

import { loadConfig } from '../src/config/load-config.js';
import { GitControlsError } from '../src/errors.js';
import { parseCliArgs } from '../src/utils/cli-args.js';
import { createLogger } from '../src/utils/logger.js';
import { runClearBranchesWorkflow } from '../src/workflows/clear-branches.js';

const HELP = `
Usage: coolkit clear-branches [options]

Removes local branches that pile up after checkout/MR work.
Fetches and prunes remote refs first, checks out a safe base branch, then
deletes local branches that are not long-lived.

Default: keeps protectedBranches from config plus dev/qa/uat/pre-uat env branches.
Use --all to keep only the base branch (same as prune-branches --nuke-local).

Options:
  --base <branch>   Branch to land on before deleting. Default: mainBranch from config.
  --all             Delete every local branch except --base only.
  --dry-run         Preview branches that would be deleted.
  --debug           Verbose logging.
  -h, --help        Show this help.

Examples:
  coolkit clear-branches
  coolkit clear-branches --dry-run
  coolkit clear-branches --base root --all
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
    runClearBranchesWorkflow({
      config,
      logger,
      options: {
        base: getFlag('--base'),
        dryRun: hasFlag('--dry-run'),
        all: hasFlag('--all'),
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
