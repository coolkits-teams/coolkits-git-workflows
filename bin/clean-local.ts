/**
 * CLI entry point: reset local repo to a pristine state matching the remote.
 *
 * Usage:
 *   coolkit clean-local
 *   coolkit clean-local --base root
 *   coolkit clean-local --with-ignored
 *   coolkit clean-local --dry-run
 */

import { loadConfig } from '../src/config/load-config.js';
import { GitControlsError } from '../src/errors.js';
import { parseCliArgs } from '../src/utils/cli-args.js';
import { createLogger } from '../src/utils/logger.js';
import { runCleanLocalWorkflow } from '../src/workflows/clean-local.js';

const HELP_TEXT = `
Usage: coolkit clean-local [options]

Resets the local repository to a pristine state that exactly matches the remote:
  1. git fetch --prune           sync remote, drop stale refs
  2. git checkout <base>         land on the safe branch
  3. git reset --hard origin/<base>  align with remote HEAD
  4. delete ALL other local branches (no confirmation)
  5. git clean -fd[x]            remove untracked files

WARNING: This is a destructive, irreversible operation. All uncommitted work
and all local branches not on the remote will be permanently lost.
Use --dry-run to preview without making changes.

Options:
  --base <branch>   Branch to land on and reset to. Default: mainBranch from config.
  --with-ignored    Also remove ignored files (node_modules, .env, build dirs, etc.).
                    Default: only untracked non-ignored files are removed.
  --dry-run         Show what would happen without making any changes.
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
    runCleanLocalWorkflow({
      config,
      logger,
      options: {
        base: getFlag('--base'),
        withIgnored: hasFlag('--with-ignored'),
        dryRun: hasFlag('--dry-run'),
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
