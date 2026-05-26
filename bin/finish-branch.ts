/**
 * CLI entry point: finish the current branch — push it and open an MR/PR.
 *
 * Automatically determines the correct target branch based on the configured
 * architecture and branch type (feature/release/hotfix).
 *
 * Usage:
 *   git-finish-branch
 *   git-finish-branch --branch feature/my-thing
 *   git-finish-branch --target staging
 *   git-finish-branch --no-mr
 *   git-finish-branch --dry-run
 *   git-finish-branch --help
 */

import { loadConfig } from '../src/config/load-config.js';
import { GitControlsError } from '../src/errors.js';
import { parseCliArgs } from '../src/utils/cli-args.js';
import { createLogger } from '../src/utils/logger.js';
import { runFinishBranchWorkflow } from '../src/workflows/finish-branch.js';

const HELP_TEXT = `
Usage: git-finish-branch [options]

Pushes the current branch and opens a merge request / pull request.
The target branch is resolved automatically from the configured architecture
and the branch type (feature / release / hotfix).

Options:
  --branch <branch>   Branch to finish. Default: current branch.
  --target <branch>   Override the target branch for the MR/PR.
  --no-mr             Push only; skip MR/PR creation.
  --dry-run           Preview without creating anything.
  --debug             Verbose logging.
  -h, --help          Show this help.

Architecture defaults:
  feature-based  feature/* → devBranch
  gitflow        feature/* → developBranch
                 release/* → mainBranch (+ reminder for developBranch)
                 hotfix/*  → mainBranch (+ reminder for developBranch)
  github-flow    any       → mainBranch
  gitlab-flow    any       → mainBranch
  trunk-based    any       → mainBranch
  monorepo       any       → mainBranch

Examples:
  git-finish-branch
  git-finish-branch --branch feature/auth
  git-finish-branch --target staging
  git-finish-branch --no-mr   # push only, create MR manually
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
    runFinishBranchWorkflow({
      config,
      logger,
      options: {
        branch: getFlag('--branch'),
        target: getFlag('--target'),
        skipMr: hasFlag('--no-mr'),
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
