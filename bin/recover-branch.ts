#!/usr/bin/env node
/**
 * git-recover-branch — Recover a recently deleted branch using the reflog.
 *
 * Usage:
 *   git-recover-branch feature/my-thing
 *   git-recover-branch feature/my-thing --from abc1234
 */
import { GitControlsError } from '../src/errors.js';
import { parseCliArgs } from '../src/utils/cli-args.js';
import { createLogger } from '../src/utils/logger.js';
import { runRecoverBranchWorkflow } from '../src/workflows/recover-branch.js';

const HELP = `
Usage: git-recover-branch <branch-name> [options]

Searches the reflog to restore a recently deleted branch.
Works if the branch was deleted within the reflog expiry window (default: 90 days).

Arguments:
  <branch-name>     Name of the deleted branch to restore

Options:
  --from <hash>     Explicit commit hash to restore from (skips reflog search)
  -h, --help        Show this help
`.trim();

const { hasFlag, getFlag, positionals } = parseCliArgs(process.argv);
if (hasFlag('-h') || hasFlag('--help')) {
  process.stdout.write(HELP + '\n');
  process.exit(0);
}

const branch = positionals[0];
if (!branch) {
  process.stderr.write('Error: branch name is required.\n\n' + HELP + '\n');
  process.exit(1);
}

const logger = createLogger({ debug: hasFlag('--debug') });

try {
  runRecoverBranchWorkflow({ logger, options: { branch, from: getFlag('--from') } });
} catch (e) {
  if (e instanceof GitControlsError) {
    logger.err(e.message);
    e.details?.forEach((d) => {
      logger.err(`  ${d}`);
    });
  } else logger.err(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
