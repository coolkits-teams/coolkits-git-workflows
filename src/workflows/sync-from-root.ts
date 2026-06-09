import { createBranchResolver } from '../core/branch-resolver.js';
import {
  classifyConflictFile,
  detectOwnedFeatureDirs,
  listConflictedFiles,
  listNewFilesInOtherDirs,
  takeMineVersion,
  takeRootVersion,
} from '../core/feature-scope.js';
import { createGitClient } from '../core/git-client.js';
import { createWorkingTreeInspector } from '../core/working-tree.js';
import type { Config, GitClient, Logger, SyncOptions, SyncResult } from '../types.js';
import { buildSyncBackupTag, formatExtractTimestamp } from '../utils/extract-labels.js';

export function runSyncFromRootWorkflow({
  config,
  logger,
  options = {},
}: {
  config: Config;
  logger: Logger;
  options?: SyncOptions;
}): SyncResult {
  const git = createGitClient();
  const branches = createBranchResolver({ git, config });
  const workingTree = createWorkingTreeInspector({ git });

  logger.info('Running pre-flight checks...');

  if (!workingTree.isGitRepository()) {
    throw new Error('Not inside a git repository.');
  }

  const featureBranch = branches.resolve(options.feature ?? options.branch);
  branches.ensureFeatureBranch(featureBranch);
  workingTree.assertClean();

  logger.info(`Feature branch: ${featureBranch}`);
  branches.checkout(featureBranch);

  const mainRef = `${config.remote}/${config.mainBranch}`;

  logger.info(`Fetching ${mainRef}...`);
  git.runOrThrow(['fetch', config.remote, config.mainBranch]);

  const behind = Number(git.runOrThrow(['rev-list', '--count', `HEAD..${mainRef}`]).trim());
  const ahead = Number(git.runOrThrow(['rev-list', '--count', `${mainRef}..HEAD`]).trim());

  logger.info(
    `Branch status vs ${mainRef}: ahead=${ahead.toString()}, behind=${behind.toString()}`,
  );

  if (behind === 0) {
    logger.ok(`'${featureBranch}' is already up to date with '${mainRef}'.`);
    return { status: 'up-to-date' };
  }

  logger.info(`${behind.toString()} commit(s) from '${mainRef}' will be merged:`);
  git
    .run(['log', '--oneline', '--no-decorate', `HEAD..${mainRef}`])
    .stdout.split('\n')
    .filter(Boolean)
    .forEach((commit) => {
      logger.plain(`  ${commit}`);
    });

  const backupTag = createBackupTag(git, featureBranch, config);
  logger.info(`Backup tag created: ${backupTag}`);
  logger.info(`Rollback command:   git reset --hard ${backupTag}`);

  logger.info(`Merging '${mainRef}' into '${featureBranch}'...`);
  const mergeResult = git.run(['merge', '--no-edit', mainRef], { stdio: 'inherit' });

  if (!mergeResult.ok) {
    return handleConflicts({ git, logger, config, featureBranch, backupTag, options });
  }

  logger.ok('Merge completed without conflicts.');

  if (options.skipPush === true) {
    logger.warn('--no-push enabled. Push manually with: git push');
  } else {
    logger.info(`Pushing to ${config.remote}/${featureBranch}...`);
    git.runOrThrow(['push'], { stdio: 'inherit' });
    logger.ok('Push completed.');
  }

  logger.ok('Sync completed.');
  logger.plain(`Delete the backup tag when satisfied: git tag -d ${backupTag}`);

  return { status: 'synced', backupTag };
}

function createBackupTag(git: GitClient, branch: string, config: Config): string {
  const timestamp = formatExtractTimestamp(new Date());
  const tagName = buildSyncBackupTag(branch, timestamp, config);
  git.runOrThrow(['tag', tagName]);
  return tagName;
}

/**
 * Smart conflict handling for a root→feature sync.
 *
 * Resolution rules:
 *   - mine  (current feature's own files)  → auto-keep HEAD (feature branch code)
 *   - other (different feature's files)    → auto-take root 100%
 *   - shared/common (outside featurePath)  → leave for dev, listed with a clear note
 *
 * Never commits or pushes — the developer reviews, type-checks, and commits.
 */
function handleConflicts({
  git,
  logger,
  config,
  featureBranch,
  backupTag,
  options,
}: {
  git: GitClient;
  logger: Logger;
  config: Config;
  featureBranch: string;
  backupTag: string;
  options: SyncOptions;
}): SyncResult {
  const conflicts = listConflictedFiles(git);
  logger.warn(`Merge stopped with ${conflicts.length.toString()} conflicted file(s).`);

  const baseRef = git.runOrThrow(['merge-base', 'HEAD', 'MERGE_HEAD']).trim();
  const ownedDirs = detectOwnedFeatureDirs({ git, config, baseRef, branchRef: 'HEAD' });

  // No owned feature detected, or opt-out → leave everything for the developer.
  if (options.manual === true || ownedDirs.length === 0) {
    const reason =
      options.manual === true
        ? '--manual enabled'
        : `no owned feature detected for '${featureBranch}'`;
    logger.warn(`Auto-resolution skipped (${reason}). Resolve all conflicts manually:`);
    conflicts.forEach((f) => {
      logger.plain(`  - ${f}`);
    });
    printNextSteps(logger, backupTag);
    return { status: 'manual', backupTag, manualFiles: conflicts };
  }

  logger.info(`Feature branch owns: ${ownedDirs.join(', ')}`);

  const keptMine: string[] = [];
  const keptRoot: string[] = [];
  const sharedFiles: string[] = [];

  conflicts.forEach((file) => {
    const ownership = classifyConflictFile(file, ownedDirs, config);

    if (ownership === 'shared') {
      // Common/shared file: leave conflicted for dev to resolve manually.
      sharedFiles.push(file);
      return;
    }

    if (ownership === 'mine') {
      // My own feature's file: keep current branch (HEAD) — I own this code.
      takeMineVersion({ git, file });
      keptMine.push(file);
      return;
    }

    // Other feature's file: root is the source of truth — take it 100%.
    takeRootVersion({ git, file, rootRef: 'MERGE_HEAD' });
    keptRoot.push(file);
  });

  // Also bring in NEW files that root added to other-feature dirs.
  // These aren't in the conflict list but auto-resolved files may import them.
  const newOtherFiles = listNewFilesInOtherDirs({
    git,
    config,
    ownedDirs,
    rootRef: 'MERGE_HEAD',
  });
  newOtherFiles.forEach((file) => {
    takeRootVersion({ git, file, rootRef: 'MERGE_HEAD' });
    keptRoot.push(file);
  });

  if (keptMine.length > 0) {
    logger.ok(`Auto-resolved ${keptMine.length.toString()} own-feature file(s) → kept your code:`);
    keptMine.forEach((f) => {
      logger.plain(`  ✓ [mine] ${f}`);
    });
  }

  if (keptRoot.length > 0) {
    logger.ok(
      `Auto-resolved ${keptRoot.length.toString()} other-feature file(s) → kept root (100%):`,
    );
    keptRoot.forEach((f) => {
      logger.plain(`  ✓ [root] ${f}`);
    });
  }

  if (sharedFiles.length > 0) {
    logger.warn(
      `${sharedFiles.length.toString()} common/shared file(s) still need manual resolution:`,
    );
    sharedFiles.forEach((f) => {
      logger.plain(`  ✎ ${f}`);
    });
    logger.plain('');
    logger.plain('  Common/shared files are owned by the whole team. Please:');
    logger.plain('  1. Resolve the conflicts in those files manually.');
    logger.plain('  2. If your change is a shared improvement, consider running');
    logger.plain('     "extract-common" to push it to root before re-syncing.');
  }

  const autoResolved = [...keptMine, ...keptRoot];
  printNextSteps(logger, backupTag, sharedFiles.length > 0);
  return { status: 'partial', backupTag, autoResolved, manualFiles: sharedFiles };
}

function printNextSteps(logger: Logger, backupTag: string, hasManual = true): void {
  logger.plain('');
  logger.plain('Next steps (nothing committed or pushed yet):');
  if (hasManual) {
    logger.plain('  1. Resolve the files listed above, then: git add <file>');
    logger.plain('  2. Verify the build: npx tsc --noEmit');
    logger.plain('  3. Complete the merge: git commit');
    logger.plain('  4. Push when satisfied: git push');
  } else {
    logger.plain('  1. Verify the build: npx tsc --noEmit');
    logger.plain('  2. Complete the merge: git commit');
    logger.plain('  3. Push when satisfied: git push');
  }
  logger.plain(`Abort instead: git merge --abort && git tag -d ${backupTag}`);
}
