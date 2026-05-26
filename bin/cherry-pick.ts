/**
 * git-cherry-pick — Apply specific commit(s) from another branch.
 *
 * Usage:
 *   git-cherry-pick abc1234
 *   git-cherry-pick abc1234 --range-to def5678   # picks abc1234..def5678
 *   git-cherry-pick abc1234 --no-commit
 */
import { GitControlsError } from '../src/errors.js';
import { parseCliArgs } from '../src/utils/cli-args.js';
import { createLogger } from '../src/utils/logger.js';
import { runCherryPickWorkflow } from '../src/workflows/cherry-pick.js';

const HELP = `
Usage: git-cherry-pick <commit-hash> [options]

Applies a specific commit (or range of commits) onto the current branch.

Arguments:
  <commit-hash>        Commit hash to cherry-pick

Options:
  --range-to <hash>    End of range: picks all commits from <hash> to <range-to>
  --no-commit          Stage the changes without committing (for review)
  -h, --help           Show this help
`.trim();

const { hasFlag, getFlag, positionals } = parseCliArgs(process.argv);
if (hasFlag('-h') || hasFlag('--help')) {
  process.stdout.write(HELP + '\n');
  process.exit(0);
}

const commit = positionals[0];
if (!commit) {
  process.stderr.write('Error: commit hash is required.\n\n' + HELP + '\n');
  process.exit(1);
}

const logger = createLogger({ debug: hasFlag('--debug') });

try {
  runCherryPickWorkflow({
    logger,
    options: { commit, rangeTo: getFlag('--range-to'), noCommit: hasFlag('--no-commit') },
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
