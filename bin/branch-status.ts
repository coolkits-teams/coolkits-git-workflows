/**
 * coolkit branch-status — Show all local branches with ahead/behind vs main.
 *
 * Usage:
 *   coolkit branch-status
 *   coolkit branch-status --pattern feature/
 *   coolkit branch-status --no-fetch
 */

import { loadConfig } from '../src/config/load-config.js';
import { GitControlsError } from '../src/errors.js';
import { parseCliArgs } from '../src/utils/cli-args.js';
import { createLogger } from '../src/utils/logger.js';
import { runBranchStatusWorkflow } from '../src/workflows/branch-status.js';

const HELP = `
Usage: coolkit branch-status [options]

Shows all local branches with their ahead/behind counts vs main, last commit
time, author, and remote tracking status. Fetches remote first by default.

Options:
  --pattern <text>   Filter branches by name substring (e.g. "feature/").
  --no-fetch         Skip the remote fetch (use cached remote tracking data).
  --debug            Verbose logging.
  -h, --help         Show this help.

Column legend:
  Ahead    Commits ahead of main (unpushed new work)
  Behind   Commits behind main (needs sync-from-main)
  Remote   [gone] remote deleted  [local only] never pushed
           [push needed] unpushed  [diverged] both sides have commits
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
    runBranchStatusWorkflow({
      config,
      logger,
      options: {
        pattern: getFlag('--pattern'),
        noFetch: hasFlag('--no-fetch'),
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
