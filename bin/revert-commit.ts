/**
 * git-revert-commit — Safely revert a commit that was already pushed.
 * Creates a new "revert" commit instead of rewriting history.
 *
 * Usage:
 *   git-revert-commit <commit-hash>
 *   git-revert-commit <commit-hash> --no-push
 */
import { loadConfig } from '../src/config/load-config.js';
import { GitControlsError } from '../src/errors.js';
import { parseCliArgs } from '../src/utils/cli-args.js';
import { createLogger } from '../src/utils/logger.js';
import { runRevertCommitWorkflow } from '../src/workflows/revert-commit.js';

const HELP = `
Usage: git-revert-commit <commit-hash> [options]

Creates a new commit that undoes the given commit (safe for shared branches).
Does NOT rewrite history — safe to use on pushed commits.

Arguments:
  <commit-hash>   Full or short commit hash to revert

Options:
  --no-push       Skip pushing the revert commit
  -h, --help      Show this help
`.trim();

const { hasFlag, positionals } = parseCliArgs(process.argv);
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

loadConfig()
  .then((config) => {
    try {
      runRevertCommitWorkflow({
        config,
        logger,
        options: { commit, skipPush: hasFlag('--no-push') },
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
