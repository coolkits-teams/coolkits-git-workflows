/**
 * git-rebuild-clean-branch — Rebuild a contaminated feature branch as a clean
 * single-commit branch based on a known-good base.
 *
 * Use this when a feature branch accidentally received code from other
 * unreleased features (e.g. someone merged "main" into a feature branch
 * instead of syncing from "root").
 *
 * What it does:
 *   1. Creates a new branch from the base (root/main)
 *   2. Applies ONLY the diff between base..source as a patch
 *   3. Squashes everything into one clean commit
 *
 * Usage:
 *   coolkit rebuild-clean-branch
 *   coolkit rebuild-clean-branch --branch feature/payment-table
 *   coolkit rebuild-clean-branch --branch feature/payment-table --base root
 *   coolkit rebuild-clean-branch --branch feature/payment-table --output fix/payment-table-clean
 *   coolkit rebuild-clean-branch --dry-run
 *   coolkit rebuild-clean-branch --push
 */

import { loadConfig } from '../src/config/load-config.js';
import { GitControlsError } from '../src/errors.js';
import { parseCliArgs } from '../src/utils/cli-args.js';
import { createLogger } from '../src/utils/logger.js';
import { runRebuildCleanBranchWorkflow } from '../src/workflows/rebuild-clean-branch.js';

const HELP_TEXT = `
Usage: coolkit rebuild-clean-branch [options]

Rebuilds a contaminated feature branch as a new, clean single-commit branch
based on a known-good base branch (e.g. "root" or "main").

WHY USE THIS?
  When a feature branch accidentally received code from other unreleased
  features (e.g. someone merged "main" into a sub-branch instead of syncing
  from "root"), this command extracts ONLY the feature-specific diff and
  applies it cleanly on top of the base — removing all contamination.

HOW IT WORKS:
  1. git checkout -b <output-branch> <base>
  2. git diff <base>..<source> | git apply --index
  3. git commit -m "<message>"

TRADE-OFF:
  Individual commit history is squashed into one commit.
  If the original history is already polluted, this is intentional.
  To preserve individual commits use: coolkit cherry-pick

Options:
  --branch <name>    Contaminated source branch. Default: current branch.
  --base <name>      Clean base branch to rebuild from. Default: from config (mainBranch).
  --output <name>    Name for the new clean branch. Default: fix/<source-slug>-clean.
  --message <text>   Custom commit message for the single squashed commit.
  --push             Push the new clean branch to remote after creation.
  --dry-run          Preview what would happen without making any changes.
  --debug            Verbose logging.
  -h, --help         Show this help.

Examples:
  # Rebuild current branch (auto-detect from config base)
  coolkit rebuild-clean-branch

  # Rebuild a specific contaminated branch
  coolkit rebuild-clean-branch --branch feature/payment-table --base root

  # Preview without touching anything
  coolkit rebuild-clean-branch --branch feature/payment-table --dry-run

  # Custom output branch name + push immediately
  coolkit rebuild-clean-branch --branch feature/my-feature --output fix/my-feature-clean --push
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
    const result = runRebuildCleanBranchWorkflow({
      config,
      logger,
      options: {
        branch: getFlag('--branch'),
        base: getFlag('--base'),
        output: getFlag('--output'),
        message: getFlag('--message'),
        dryRun: hasFlag('--dry-run'),
        push: hasFlag('--push'),
      },
    });

    if (result.status === 'noop') {
      logger.warn('Nothing to do — source and base are identical.');
    }
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
