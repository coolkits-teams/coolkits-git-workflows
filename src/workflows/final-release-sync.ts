import { createGitClient } from '../core/git-client.js';
import { createWorkingTreeInspector } from '../core/working-tree.js';
import { createMrProvider } from '../providers/mr-provider.js';
import type {
  Config,
  FinalReleaseSyncOptions,
  FinalReleaseSyncResult,
  Logger,
} from '../types.js';
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
    logger.warn('');
    logger.warn(`Conflicts detected in '${mrBranch}'. Resolve manually:`);
    logger.plain('');
    logger.plain('  # ── STEP 1: Resolve git-level conflicts ──────────────────────────────');
    logger.plain('');
    logger.plain('  # UU — both sides edited → keep root:');
    logger.plain(`  git status --porcelain | awk '/^UU /{print $2}' | xargs -r git checkout --ours --`);
    logger.plain(`  git status --porcelain | awk '/^UU /{print $2}' | xargs -r git add`);
    logger.plain('');
    logger.plain('  # AA — both sides added same file → keep root (see STEP 2 warning below):');
    logger.plain(`  git status --porcelain | awk '/^AA /{print $2}' | xargs -r git checkout --ours --`);
    logger.plain(`  git status --porcelain | awk '/^AA /{print $2}' | xargs -r git add`);
    logger.plain('');
    logger.plain('  # UA — added by UAT, root has nothing → keep UAT version:');
    logger.plain(`  git status --porcelain | awk '/^UA /{print $2}' | xargs -r git checkout MERGE_HEAD --`);
    logger.plain(`  git status --porcelain | awk '/^UA /{print $2}' | xargs -r git add`);
    logger.plain('');
    logger.plain('  # AU — rename conflict: use HEAD tree (not --ours) to avoid staged markers:');
    logger.plain(`  git status --porcelain | awk '/^AU /{print $2}' | xargs -r git checkout HEAD --`);
    logger.plain(`  git status --porcelain | awk '/^AU /{print $2}' | xargs -r git add`);
    logger.plain('');
    logger.plain('  # DD — both deleted → confirm removal:');
    logger.plain(`  git status --porcelain | awk '/^DD /{print $2}' | xargs -r git rm`);
    logger.plain('');
    logger.plain('  # UD — UAT deleted, root modified → keep root:');
    logger.plain(`  git status --porcelain | awk '/^UD /{print $2}' | xargs -r git add`);
    logger.plain('');
    logger.plain('  # DU — root deleted, UAT modified → keep root deletion:');
    logger.plain(`  git status --porcelain | awk '/^DU /{print $2}' | xargs -r git rm`);
    logger.plain('');
    logger.plain('  # ── STEP 2: Scan for conflict markers ────────────────────────────────');
    logger.plain('');
    logger.plain(`  grep -rl "^<<<<<<" --include="*.ts" --include="*.tsx" --include="*.json" . || echo "clean"`);
    logger.plain('');
    logger.plain('  # ── STEP 3: TypeScript check (MANDATORY — prevents silent code loss) ─');
    logger.plain('');
    logger.plain('  # WARNING: --ours on UU/AA files silently drops UAT new exports/types/props.');
    logger.plain('  # If UAT added new functionality (types, exports, props), those additions');
    logger.plain('  # are the PURPOSE of this sync. Losing them means root misses the new feature.');
    logger.plain('  # tsc catches these as type errors in files that depend on the new code.');
    logger.plain('');
    logger.plain('  npx tsc --noEmit 2>&1 | grep "error TS" | grep -v node_modules');
    logger.plain('');
    logger.plain('  # For each erroring file — compare root vs UAT to decide which version to keep:');
    logger.plain('  #   git diff HEAD MERGE_HEAD -- <file>   (+ lines = UAT added, - lines = root has)');
    logger.plain('  # If UAT is a superset (adds new exports/types the errors point to):');
    logger.plain('  #   git show origin/${uatBranch}:<file> > <file> && git add <file>');
    logger.plain('  # If root is truly newer (hotfix applied after UAT):');
    logger.plain('  #   git checkout HEAD -- <file> && git add <file>');
    logger.plain('  # If UAT deleted the file (UD case, error from dependent importing it):');
    logger.plain('  #   git rm <file>');
    logger.plain('');
    logger.plain('  # Re-run tsc until 0 errors before committing.');
    logger.plain('');
    logger.plain('  # ── STEP 4: Commit and push ───────────────────────────────────────────');
    logger.plain('');
    logger.plain(`  git status --porcelain | grep -E "^(UU|AA|AU|UA|DD|UD|DU) " && echo "STILL HAS CONFLICTS" || git commit`);
    logger.plain(`  git push -u ${config.remote} ${mrBranch}`);
    logger.plain('');
    logger.plain(`  # Open MR: ${provider.buildMergeRequestUrl(mrBranch, rootBranch)}`);
    return { status: 'conflict', mrBranch };
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
