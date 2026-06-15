/**
 * git-prune-branches — Clean up local branches whose remote counterpart is gone.
 *
 * Usage:
 *   git-prune-branches
 *   git-prune-branches --dry-run
 *   git-prune-branches --nuke-local
 *   git-prune-branches -n --dry-run
 */
import { loadConfig } from '../src/config/load-config.js';
import { GitControlsError } from '../src/errors.js';
import { parseCliArgs } from '../src/utils/cli-args.js';
import { createLogger } from '../src/utils/logger.js';
import { runPruneBranchesWorkflow } from '../src/workflows/prune-branches.js';

const HELP = `
Usage: git-prune-branches [options]

Fetches from origin with --prune, then deletes local branches whose remote
tracking branch no longer exists (merged and deleted MR branches).

Options:
  -n, --nuke-local  Checkout mainBranch then force-delete ALL other local branches
  --dry-run         Show what would be deleted without actually deleting
  -h, --help        Show this help
`.trim();

const { hasFlag } = parseCliArgs(process.argv);
if (hasFlag('-h') || hasFlag('--help')) {
  process.stdout.write(HELP + '\n');
  process.exit(0);
}

const logger = createLogger({ debug: hasFlag('--debug') });

loadConfig()
  .then((config) => {
    try {
      runPruneBranchesWorkflow({
        config,
        logger,
        options: {
          dryRun: hasFlag('--dry-run'),
          nukeLocal: hasFlag('-n') || hasFlag('--nuke-local'),
        },
      });
    } catch (e) {
      if (e instanceof GitControlsError) {
        logger.err(e.message);
        e.details?.forEach((d) => {
          logger.err(`  ${d}`);
        });
      } else logger.err(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  })
  .catch((e: unknown) => {
    process.stderr.write(String(e) + '\n');
    process.exit(1);
  });
