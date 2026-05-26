/**
 * git-delete-branch — Delete a branch both locally and on the remote in one command.
 *
 * Usage:
 *   git-delete-branch feature/my-thing
 *   git-delete-branch feature/my-thing --local-only
 *   git-delete-branch feature/my-thing --force
 */
import { loadConfig } from '../src/config/load-config.js';
import { GitControlsError } from '../src/errors.js';
import { parseCliArgs } from '../src/utils/cli-args.js';
import { createLogger } from '../src/utils/logger.js';
import { runDeleteBranchWorkflow } from '../src/workflows/delete-branch.js';

const HELP = `
Usage: git-delete-branch <branch> [options]

Deletes a branch locally AND on the remote (by default).

Arguments:
  <branch>          Branch name to delete

Options:
  --local-only      Delete only the local branch
  --remote-only     Delete only the remote branch
  --force           Force-delete even if branch has unmerged commits
  -h, --help        Show this help
`.trim();

const { hasFlag, positionals } = parseCliArgs(process.argv);
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

loadConfig()
  .then((config) => {
    try {
      runDeleteBranchWorkflow({
        config,
        logger,
        options: {
          branch,
          localOnly: hasFlag('--local-only'),
          remoteOnly: hasFlag('--remote-only'),
          force: hasFlag('--force'),
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
