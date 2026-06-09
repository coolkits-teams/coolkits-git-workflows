import { autoResolveUatToRoot } from '../core/conflict-resolver.js';
import { createGitClient } from '../core/git-client.js';
import { createWorkingTreeInspector } from '../core/working-tree.js';
import { createMrProvider } from '../providers/mr-provider.js';
import type { Config, FinalReleaseSyncOptions, FinalReleaseSyncResult, Logger } from '../types.js';
import {
  buildCreateMrTitle,
  buildMrBranchName,
  formatExtractTimestamp,
} from '../utils/extract-labels.js';

/**
 * final-release-sync workflow
 *
 * After UAT testing passes, syncs UAT back into root (the source-of-truth branch).
 * Because both branches are protected, this workflow:
 *   1. Creates a safe MR branch based on root.
 *   2. Merges UAT into it locally.
 *   3. If conflicts → stops with step-by-step instructions for the developer.
 *   4. If clean → pushes the MR branch and opens the MR into root.
 */
export function runFinalReleaseSyncWorkflow({
  config,
  logger,
  options = {},
}: {
  config: Config;
  logger: Logger;
  options?: FinalReleaseSyncOptions;
}): FinalReleaseSyncResult {
  const git = createGitClient();
  const workingTree = createWorkingTreeInspector({ git });
  const provider = createMrProvider({ git, config, logger });

  logger.info('Running pre-flight checks...');

  if (!workingTree.isGitRepository()) {
    throw new Error('Not inside a git repository.');
  }

  workingTree.assertClean();

  const uatBranch = config.uatBranch;
  const rootBranch = config.mainBranch;

  // ── Fetch both branches ──────────────────────────────────────────────────

  logger.info(`Fetching '${uatBranch}' and '${rootBranch}'...`);
  git.runOrThrow(['fetch', config.remote, uatBranch]);
  git.runOrThrow(['fetch', config.remote, rootBranch]);

  const rootRef = `${config.remote}/${rootBranch}`;
  const uatRef = `${config.remote}/${uatBranch}`;

  // ── Check if there is anything to sync ──────────────────────────────────

  const newCommitCount = Number(
    git.runOrThrow(['rev-list', '--count', `${rootRef}..${uatRef}`]).trim(),
  );

  if (newCommitCount === 0) {
    logger.ok(`'${uatBranch}' is already fully merged into '${rootBranch}'. Nothing to sync.`);
    return { status: 'up-to-date' };
  }

  logger.info(
    `${newCommitCount.toString()} commit(s) in '${uatBranch}' not yet in '${rootBranch}':`,
  );
  git
    .run(['log', '--oneline', '--no-decorate', `${rootRef}..${uatRef}`])
    .stdout.split('\n')
    .filter(Boolean)
    .forEach((commit) => {
      logger.plain(`  ${commit}`);
    });

  // ── Dry-run ──────────────────────────────────────────────────────────────

  if (options.dryRun) {
    logger.ok(
      `[DRY-RUN] Would create MR branch from '${rootRef}', merge '${uatBranch}', and open MR → '${rootBranch}'.`,
    );
    return { status: 'dry-run' };
  }

  // ── Create MR branch from root, then merge UAT into it ──────────────────

  const timestamp = formatExtractTimestamp(new Date());
  const mrBranch = buildMrBranchName(uatBranch, rootBranch, timestamp, config);

  logger.info(`Creating '${mrBranch}' from '${rootRef}'...`);
  git.runOrThrow(['checkout', '-b', mrBranch, rootRef]);

  logger.info(`Merging '${uatRef}' into '${mrBranch}'...`);
  const mergeResult = git.run(['merge', '--no-edit', uatRef], { stdio: 'inherit' });

  if (!mergeResult.ok) {
    return autoResolveAndReport({ git, logger, config, mrBranch, rootBranch, provider });
  }

  logger.ok(`Merged '${uatBranch}' into '${mrBranch}' without conflicts.`);

  // ── Push MR branch ───────────────────────────────────────────────────────

  logger.info(`Pushing '${mrBranch}' to ${config.remote}...`);
  git.runOrThrow(['push', '-u', config.remote, mrBranch], { stdio: 'inherit' });
  logger.ok(`Pushed '${mrBranch}'.`);

  // ── Open MR ──────────────────────────────────────────────────────────────

  const title = buildCreateMrTitle({
    sourceBranch: uatBranch,
    targetBranch: rootBranch,
    mrBranch,
    timestamp,
    architecture: config.architecture,
    isCheckout: true,
    config,
  });

  const description = buildSyncDescription(uatBranch, rootBranch, mrBranch, newCommitCount, config);

  const result = provider.createMergeRequest({
    sourceBranch: mrBranch,
    targetBranch: rootBranch,
    title,
    description,
    cwd: process.cwd(),
  });

  logger.ok(`MR created: ${result.url}`);
  logger.plain(`Delete '${mrBranch}' after the MR is merged.`);

  return { status: 'created', mrBranch, url: result.url };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Auto-resolve all conflicts with root priority, then STOP for review.
 *
 * - "both modified" hunks → keep root; additive hunks → keep both sides (dedup-safe).
 * - File-level conflicts → deterministic root-priority rules.
 * Nothing is committed: the developer reviews merged-both files, runs tsc, then commits.
 */
function autoResolveAndReport({
  git,
  logger,
  config,
  mrBranch,
  rootBranch,
  provider,
}: {
  git: ReturnType<typeof createGitClient>;
  logger: Logger;
  config: Config;
  mrBranch: string;
  rootBranch: string;
  provider: ReturnType<typeof createMrProvider>;
}): FinalReleaseSyncResult {
  logger.warn('');
  logger.warn(`Conflicts detected in '${mrBranch}'. Auto-resolving with root priority...`);

  const summary = autoResolveUatToRoot({ git, config });

  logger.plain('');
  if (summary.keptUat.length > 0) {
    logger.ok(`Kept UAT version — feature files (${summary.keptUat.length.toString()} file(s)):`);
    summary.keptUat.forEach((f) => {
      logger.plain(`  ✓ [uat] ${f}`);
    });
  }
  if (summary.keptRoot.length > 0) {
    logger.ok(`Kept root version — common files (${summary.keptRoot.length.toString()} file(s)):`);
    summary.keptRoot.forEach((f) => {
      logger.plain(`  ✓ [root] ${f}`);
    });
  }
  if (summary.removed.length > 0) {
    logger.ok(`Removed (${summary.removed.length.toString()} file(s)):`);
    summary.removed.forEach((f) => {
      logger.plain(`  - ${f}`);
    });
  }

  logger.plain('');
  logger.plain('Next steps (nothing committed or pushed yet):');
  logger.plain('  1. Verify the build (MANDATORY): npx tsc --noEmit');
  logger.plain('  2. Complete the merge: git commit --no-edit');
  logger.plain(`  3. Push the MR branch: git push -u ${config.remote} ${mrBranch}`);
  logger.plain(`  4. Open MR: ${provider.buildMergeRequestUrl(mrBranch, rootBranch)}`);
  logger.plain('');
  logger.plain(`  Abort instead: git merge --abort && git checkout ${rootBranch}`);

  return { status: 'conflict', mrBranch };
}

function buildSyncDescription(
  uatBranch: string,
  rootBranch: string,
  mrBranch: string,
  commitCount: number,
  config: Config,
): string {
  return [
    `Sync \`${uatBranch}\` into \`${rootBranch}\` after a successful UAT release.`,
    '',
    `| Field        | Value |`,
    `| ------------ | ----- |`,
    `| Architecture | \`${config.architecture}\` |`,
    `| UAT branch   | \`${uatBranch}\` |`,
    `| Root branch  | \`${rootBranch}\` |`,
    `| MR branch    | \`${mrBranch}\` (safe checkout — delete after merge) |`,
    `| Commits      | ${commitCount.toString()} |`,
    '',
    '_Created by [@coolkits/git-workflows](https://github.com/coolkits-teams/coolkits-git-workflows) `final-release-sync`._',
  ].join('\n');
}
