/**
 * coolkit rename-branch — Rename a branch locally and on the remote in one command.
 *
 * Usage:
 *   coolkit rename-branch <new-name>
 *   coolkit rename-branch <new-name> --branch feature/old-name
 *   coolkit rename-branch <new-name> --no-remote
 */

import { loadConfig } from '../src/config/load-config.js';
import { GitControlsError } from '../src/errors.js';
import { parseCliArgs } from '../src/utils/cli-args.js';
import { createLogger } from '../src/utils/logger.js';
import { runRenameBranchWorkflow } from '../src/workflows/rename-branch.js';

const HELP = `
Usage: coolkit rename-branch <new-name> [options]

Renames a branch locally, then pushes the new name and deletes the old remote
branch in a single command. Updates tracking automatically.

Arguments:
  <new-name>         The new branch name (required).

Options:
  --branch <name>    Branch to rename. Default: current branch.
  --no-remote        Local rename only — skip remote push/delete.
  --debug            Verbose logging.
  -h, --help         Show this help.

Examples:
  coolkit rename-branch feature/payment-v2
  coolkit rename-branch feature/auth --branch feature/old-auth
  coolkit rename-branch feature/local-only --no-remote
`.trim();

async function main(): Promise<void> {
  const { hasFlag, getFlag, positionals } = parseCliArgs(process.argv);

  if (hasFlag('--help') || hasFlag('-h')) {
    process.stdout.write(`${HELP}\n`);
    return;
  }

  const newName = positionals[0] ?? getFlag('--name');

  if (!newName) {
    process.stderr.write('Error: new branch name is required.\n\n' + HELP + '\n');
    process.exit(1);
  }

  const logger = createLogger({ debug: hasFlag('--debug') });
  const config = await loadConfig();

  try {
    runRenameBranchWorkflow({
      config,
      logger,
      options: {
        newName,
        branch: getFlag('--branch'),
        noRemote: hasFlag('--no-remote'),
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
