#!/usr/bin/env node
/**
 * git-undo — Undo the last N local (unpushed) commits.
 *
 * Usage:
 *   git-undo                  # undo 1 commit, keep changes staged (soft)
 *   git-undo --count 3        # undo 3 commits, keep changes staged
 *   git-undo --hard           # undo 1 commit AND discard all changes
 *   git-undo --count 2 --hard
 */
import { loadConfig } from '../src/config/load-config.js';
import { GitControlsError } from '../src/errors.js';
import { parseCliArgs } from '../src/utils/cli-args.js';
import { createLogger } from '../src/utils/logger.js';
import { runUndoWorkflow } from '../src/workflows/undo.js';

const HELP = `
Usage: git-undo [options]

Undo the last N unpushed commits. Uses --soft by default (changes remain staged).

Options:
  --count <N>   Number of commits to undo (default: 1)
  --hard        Also discard all file changes (cannot be undone!)
  -h, --help    Show this help
`.trim();

const { hasFlag, getFlag } = parseCliArgs(process.argv);
if (hasFlag('-h') || hasFlag('--help')) {
  process.stdout.write(HELP + '\n');
  process.exit(0);
}

const rawCount = getFlag('--count');
const count = rawCount ? parseInt(rawCount, 10) : 1;
if (isNaN(count)) {
  process.stderr.write('Error: --count must be a number\n');
  process.exit(1);
}

const logger = createLogger({ debug: hasFlag('--debug') });

loadConfig()
  .then((config) => {
    try {
      runUndoWorkflow({ config, logger, options: { count, hard: hasFlag('--hard') } });
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
