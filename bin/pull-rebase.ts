#!/usr/bin/env node
/**
 * git-pull-rebase — Pull from remote using rebase instead of merge.
 * Keeps a linear history with no extra merge commits.
 *
 * Usage:
 *   git-pull-rebase
 *   git-pull-rebase --branch main
 */
import { loadConfig } from '../src/config/load-config.js';
import { GitControlsError } from '../src/errors.js';
import { parseCliArgs } from '../src/utils/cli-args.js';
import { createLogger } from '../src/utils/logger.js';
import { runPullRebaseWorkflow } from '../src/workflows/pull-rebase.js';

const HELP = `
Usage: git-pull-rebase [options]

Equivalent to: git pull --rebase origin <current-branch>
Replays your local commits on top of the latest remote state.
Avoids the extra merge commit that "git pull" creates by default.

Options:
  --branch <name>   Pull a specific branch (default: current branch)
  -h, --help        Show this help
`.trim();

const { hasFlag, getFlag } = parseCliArgs(process.argv);
if (hasFlag('-h') || hasFlag('--help')) {
  process.stdout.write(HELP + '\n');
  process.exit(0);
}

const logger = createLogger({ debug: hasFlag('--debug') });

loadConfig()
  .then((config) => {
    try {
      runPullRebaseWorkflow({ config, logger, options: { branch: getFlag('--branch') } });
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
