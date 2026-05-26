#!/usr/bin/env node
/**
 * git-abort — Abort a stuck merge, rebase, cherry-pick, revert, or bisect.
 * Detects the current state automatically.
 *
 * Usage:
 *   git-abort
 */
import { GitControlsError } from '../src/errors.js';
import { parseCliArgs } from '../src/utils/cli-args.js';
import { createLogger } from '../src/utils/logger.js';
import { runAbortWorkflow } from '../src/workflows/abort.js';

const HELP = `
Usage: git-abort

Detects and aborts the current in-progress git operation:
  - merge       → git merge --abort
  - rebase      → git rebase --abort
  - cherry-pick → git cherry-pick --abort
  - revert      → git revert --abort
  - bisect      → git bisect reset

Options:
  -h, --help    Show this help
`.trim();

const { hasFlag } = parseCliArgs(process.argv);
if (hasFlag('-h') || hasFlag('--help')) {
  process.stdout.write(HELP + '\n');
  process.exit(0);
}

const logger = createLogger({ debug: hasFlag('--debug') });

try {
  runAbortWorkflow({ logger });
} catch (e) {
  if (e instanceof GitControlsError) {
    logger.err(e.message);
    e.details?.forEach((d) => {
      logger.err(`  ${d}`);
    });
  } else logger.err(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
