/**
 * CLI entry point: create a new branch following the current architecture's conventions.
 *
 * Usage:
 *   git-start-branch user-auth
 *   git-start-branch user-auth --type feature
 *   git-start-branch 1.2.0 --type release
 *   git-start-branch critical-fix --type hotfix
 *   git-start-branch user-auth --from develop
 *   git-start-branch user-auth --no-push
 *   git-start-branch --help
 */

import { loadConfig } from '../src/config/load-config.js';
import { GitControlsError } from '../src/errors.js';
import type { BranchType } from '../src/types.js';
import { parseCliArgs } from '../src/utils/cli-args.js';
import { createLogger } from '../src/utils/logger.js';
import { runStartBranchWorkflow } from '../src/workflows/start-branch.js';

const HELP_TEXT = `
Usage: git-start-branch <name> [options]

Creates a new branch following the conventions of the configured architecture.
The branch prefix and base branch are determined automatically.

Arguments:
  <name>              Short name / slug (e.g. "user-auth", "1.2.0", "fix-login")

Options:
  --type <type>       Branch type: feature (default), release, hotfix, fix, chore.
  --from <branch>     Override the base branch. Default: architecture-aware.
  --no-push           Create locally only; do not push to remote.
  --debug             Verbose logging.
  -h, --help          Show this help.

Architecture defaults:
  feature-based  feature/* from devBranch     | hotfix/* from mainBranch
  gitflow        feature/* from developBranch  | release/* from developBranch | hotfix/* from mainBranch
  github-flow    feature/* from mainBranch
  gitlab-flow    feature/* from mainBranch
  trunk-based    feature/* from mainBranch (keep branches short-lived!)
  monorepo       feature/* from mainBranch (use scope: feature/pkg-name)

Examples:
  git-start-branch user-auth
  git-start-branch user-auth --type feature
  git-start-branch 1.2.0 --type release
  git-start-branch critical-login-fix --type hotfix
  git-start-branch update-deps --type chore --no-push
`.trim();

const VALID_TYPES: BranchType[] = ['feature', 'release', 'hotfix', 'fix', 'chore'];

async function main(): Promise<void> {
  const { hasFlag, getFlag, positionals } = parseCliArgs(process.argv);

  if (hasFlag('--help') || hasFlag('-h')) {
    process.stdout.write(`${HELP_TEXT}\n`);
    return;
  }

  const name = positionals[0];
  if (!name) {
    process.stderr.write('Error: branch name is required.\n\n');
    process.stderr.write(`${HELP_TEXT}\n`);
    process.exit(1);
  }

  const rawType = getFlag('--type') ?? 'feature';
  if (!VALID_TYPES.includes(rawType as BranchType)) {
    process.stderr.write(
      `Error: invalid --type '${rawType}'. Valid values: ${VALID_TYPES.join(', ')}\n`,
    );
    process.exit(1);
  }

  const logger = createLogger({ debug: hasFlag('--debug') });
  const config = await loadConfig();

  try {
    runStartBranchWorkflow({
      config,
      logger,
      options: {
        name,
        type: rawType as BranchType,
        from: getFlag('--from'),
        push: !hasFlag('--no-push'),
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
