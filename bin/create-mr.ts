/**
 * CLI entry point: create a merge request / pull request from any branch into any branch.
 *
 * Usage:
 *   git-create-mr
 *   git-create-mr --source feature/my-thing --target dev
 *   git-create-mr --target main --checkout
 *   git-create-mr --target main --checkout --base target   # surface conflicts locally
 *   git-create-mr --dry-run
 *   git-create-mr --help
 */

import { loadConfig } from '../src/config/load-config.js';
import { GitControlsError } from '../src/errors.js';
import { parseCliArgs } from '../src/utils/cli-args.js';
import { createLogger } from '../src/utils/logger.js';
import { runCreateMrWorkflow } from '../src/workflows/create-mr.js';

const HELP_TEXT = `
Usage: git-create-mr [options]

Creates a merge request (GitLab) or pull request (GitHub) from a source branch
into a target branch. Works with all supported architectures.

Options:
  --source <branch>        Source branch. Default: current branch.
  --target <branch>        Target branch. Default: architecture-aware
                           (devBranch for feature-based, mainBranch for others).
  --title <title>          MR/PR title. Default: auto-generated.
  --checkout               Create a dedicated MR branch before pushing.
                           Keeps the source branch clean; lets you resolve
                           conflicts without polluting your feature branch.
  --base source|target     When --checkout is set:
                             source (default) — MR branch copied from source
                             target           — MR branch based on target then
                                               merged from source (shows conflicts)
  --no-push                Push manually; only open the MR dialog.
  --dry-run                Preview without creating anything.
  --debug                  Verbose logging.
  -h, --help               Show this help.

Examples:
  # Quick MR from current feature branch to dev (feature-based default)
  git-create-mr

  # MR to main with a safe checkout branch
  git-create-mr --target main --checkout

  # MR to staging, surfacing conflicts locally first
  git-create-mr --target staging --checkout --base target

  # Explicit source and target
  git-create-mr --source feature/auth --target develop
`.trim();

async function main(): Promise<void> {
  const { hasFlag, getFlag } = parseCliArgs(process.argv);

  if (hasFlag('--help') || hasFlag('-h')) {
    process.stdout.write(`${HELP_TEXT}\n`);
    return;
  }

  const logger = createLogger({ debug: hasFlag('--debug') });
  const config = await loadConfig();

  const rawBase = getFlag('--base');
  const checkoutBase: 'source' | 'target' = rawBase === 'target' ? 'target' : 'source';

  try {
    runCreateMrWorkflow({
      config,
      logger,
      options: {
        source: getFlag('--source'),
        target: getFlag('--target'),
        title: getFlag('--title'),
        checkout: hasFlag('--checkout'),
        ...(hasFlag('--checkout') ? { checkoutBase } : {}),
        dryRun: hasFlag('--dry-run'),
        skipPush: hasFlag('--no-push'),
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
