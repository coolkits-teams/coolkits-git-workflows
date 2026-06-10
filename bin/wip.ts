/**
 * coolkit wip — Quickly save or restore work-in-progress state.
 *
 * Usage:
 *   coolkit wip                           # stage all + commit "wip: save work at <timestamp>"
 *   coolkit wip --message "auth in progress"  # custom message
 *   coolkit wip --push                    # save + force-push to remote
 *   coolkit wip --pop                     # undo the last WIP commit (soft-reset)
 */

import { loadConfig } from '../src/config/load-config.js';
import { GitControlsError } from '../src/errors.js';
import { parseCliArgs } from '../src/utils/cli-args.js';
import { createLogger } from '../src/utils/logger.js';
import { runWipWorkflow } from '../src/workflows/wip.js';

const HELP = `
Usage: coolkit wip [options]

Quickly save the current working state as a "WIP" commit, or restore it.
All unstaged + untracked files are staged and committed in one shot.

Options:
  --message <text>  Custom message (without the "wip:" prefix). Default: timestamp.
  --pop             Undo the last WIP commit (soft-reset, files go back to working tree).
  --push            Push the WIP commit to remote after saving.
  --debug           Verbose logging.
  -h, --help        Show this help.

Examples:
  coolkit wip                            # save current work
  coolkit wip --message "auth refactor"  # save with a label
  coolkit wip --push                     # save and share with team
  coolkit wip --pop                      # restore (undo wip commit)
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
    runWipWorkflow({
      config,
      logger,
      options: {
        message: getFlag('--message'),
        pop: hasFlag('--pop'),
        push: hasFlag('--push'),
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
