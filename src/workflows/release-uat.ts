import { createBranchResolver } from '../core/branch-resolver.js';
import { createGitClient } from '../core/git-client.js';
import { createWorkingTreeInspector } from '../core/working-tree.js';
import type { Config, Logger, ReleaseUatOptions, ReleaseUatResult } from '../types.js';
import { runCreateMrWorkflow } from './create-mr.js';
import { runSyncFromRootWorkflow } from './sync-from-root.js';

/**
 * release-uat workflow
 *
 * 1. Merges root (config.mainBranch) into the feature branch so it is up to date.
 *    Stops with instructions if there are conflicts — dev resolves manually,
 *    then re-runs this command.
 * 2. Opens an MR from the feature branch into the UAT branch (--checkout safe-branch).
 */
export function runReleaseUatWorkflow({
  config,
  logger,
  options = {},
}: {
  config: Config;
  logger: Logger;
  options?: ReleaseUatOptions;
}): ReleaseUatResult {
  const git = createGitClient();
  const branches = createBranchResolver({ git, config });
  const workingTree = createWorkingTreeInspector({ git });

  if (!workingTree.isGitRepository()) {
    throw new Error('Not inside a git repository.');
  }

  const featureBranch = branches.resolve(options.branch);
  branches.ensureFeatureBranch(featureBranch);

  logger.info(`Releasing '${featureBranch}' → '${config.uatBranch}'.`);

  if (options.dryRun) {
    logger.ok(
      `[DRY-RUN] Would sync '${config.mainBranch}' into '${featureBranch}', then open MR → '${config.uatBranch}'.`,
    );
    return { status: 'dry-run', featureBranch, mrBranch: featureBranch };
  }

  // ── Step 1: sync root into feature branch ───────────────────────────────

  logger.info('');
  logger.info(`[1/2] Syncing '${config.mainBranch}' into '${featureBranch}'...`);

  /*
   * runSyncFromRootWorkflow throws when a merge conflict is detected.
   * The error message includes step-by-step resolution instructions.
   * The caller (bin) propagates the exit-code-1 so the dev sees them.
   * After resolving and committing, re-running this command will find the
   * branch already up-to-date and proceed to Step 2.
   */
  runSyncFromRootWorkflow({
    config,
    logger,
    options: { branch: featureBranch },
  });

  // ── Step 2: create MR feature → UAT ─────────────────────────────────────

  logger.info('');
  logger.info(`[2/2] Creating MR: '${featureBranch}' → '${config.uatBranch}'...`);

  const mrResult = runCreateMrWorkflow({
    config,
    logger,
    options: {
      source: featureBranch,
      target: config.uatBranch,
      checkout: true,
    },
  });

  return {
    status: mrResult.status,
    featureBranch,
    mrBranch: mrResult.mrBranch,
    url: mrResult.url,
  };
}
