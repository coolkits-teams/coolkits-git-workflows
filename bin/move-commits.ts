/**
 * git-move-commits — Move the last N commits to a different branch.
 * Ideal for "I committed to main by mistake" situations.
 *
 * Usage:
 *   git-move-commits --to feature/my-thing          # move 1 commit
 *   git-move-commits --to feature/my-thing --count 3
 */
import { loadConfig } from '../src/config/load-config.js';
import { GitControlsError } from '../src/errors.js';
import { parseCliArgs } from '../src/utils/cli-args.js';
import { createLogger } from '../src/utils/logger.js';
import { runMoveCommitsWorkflow } from '../src/workflows/move-commits.js';

const HELP = `
Usage: git-move-commits --to <branch> [options]

Moves the last N unpushed commits from the current branch to a target branch.
The current branch is rolled back the same number of commits.

Options:
  --to <branch>   Target branch (created if it doesn't exist) [required]
  --count <N>     Number of commits to move (default: 1)
  -h, --help      Show this help
`.trim();

const { hasFlag, getFlag } = parseCliArgs(process.argv);
if (hasFlag('-h') || hasFlag('--help')) {
  process.stdout.write(HELP + '\n');
  process.exit(0);
}

const to = getFlag('--to');
if (!to) {
  process.stderr.write('Error: --to <branch> is required.\n\n' + HELP + '\n');
  process.exit(1);
}

const rawCount = getFlag('--count');
const count = rawCount ? parseInt(rawCount, 10) : 1;
if (isNaN(count)) {
  process.stderr.write('Error: --count must be a number.\n');
  process.exit(1);
}

const logger = createLogger({ debug: hasFlag('--debug') });

loadConfig()
  .then((config) => {
    try {
      runMoveCommitsWorkflow({ config, logger, options: { to, count } });
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
