#!/usr/bin/env node
/**
 * git-bisect — Guided binary search to find which commit introduced a bug.
 *
 * Usage:
 *   git-bisect start --good abc1234 --bad HEAD
 *   git-bisect good    # after testing: mark current as good
 *   git-bisect bad     # after testing: mark current as bad
 *   git-bisect reset   # abort and return to original branch
 */
import { GitControlsError } from '../src/errors.js';
import type { BisectAction } from '../src/workflows/bisect.js';
import { parseCliArgs } from '../src/utils/cli-args.js';
import { createLogger } from '../src/utils/logger.js';
import { runBisectWorkflow } from '../src/workflows/bisect.js';

const HELP = `
Usage: git-bisect <action> [options]

Guided binary search through git history to find a bug-introducing commit.

Actions:
  start    Begin bisect session (requires --good)
  good     Mark current checkout as working (no bug)
  bad      Mark current checkout as broken (has bug)
  reset    Abort bisect and return to original branch

Options (for start):
  --good <commit>   Last known good commit hash [required]
  --bad  <commit>   Known bad commit (default: HEAD)
  -h, --help        Show this help

Workflow:
  1. git-bisect start --good <last-good-commit>
  2. Test the checked-out commit
  3. git-bisect good  OR  git-bisect bad
  4. Repeat until git reports the first bad commit
  5. git-bisect reset
`.trim();

const VALID_ACTIONS: BisectAction[] = ['start', 'good', 'bad', 'reset'];

const { hasFlag, getFlag, positionals } = parseCliArgs(process.argv);
if (hasFlag('-h') || hasFlag('--help')) {
  process.stdout.write(HELP + '\n');
  process.exit(0);
}

const action = positionals[0] as BisectAction | undefined;
if (!action || !VALID_ACTIONS.includes(action)) {
  process.stderr.write(`Error: action must be one of: ${VALID_ACTIONS.join(', ')}\n\n${HELP}\n`);
  process.exit(1);
}

const logger = createLogger({ debug: hasFlag('--debug') });

try {
  runBisectWorkflow({
    logger,
    options: { action, good: getFlag('--good'), bad: getFlag('--bad') },
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
