import { createBranchResolver } from '../core/branch-resolver.js';
import {
  classifyConflictFile,
  detectOwnedFeatureDirs,
  listConflictedFiles,
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
 * Auto-resolves conflicts in OTHER features (keep root, the source of truth) and leaves
 * the developer's OWN feature + shared/common files untouched for manual resolution.
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

  const autoResolved: string[] = [];
  const manualFiles: string[] = [];

  conflicts.forEach((file) => {
    const ownership = classifyConflictFile(file, ownedDirs, config);
    if (ownership === 'other') {
      takeRootVersion({ git, file, rootRef: 'MERGE_HEAD' });
      autoResolved.push(file);
    } else {
      manualFiles.push(file);
    }
  });

  if (autoResolved.length > 0) {
    logger.ok(`Auto-resolved ${autoResolved.length.toString()} other-feature file(s) → kept root:`);
    autoResolved.forEach((f) => {
      logger.plain(`  ✓ ${f}`);
    });
  }

  if (manualFiles.length > 0) {
    logger.warn(`${manualFiles.length.toString()} file(s) need your manual resolution:`);
    manualFiles.forEach((f) => {
      logger.plain(`  - ${f}`);
    });
  }

  printNextSteps(logger, backupTag, manualFiles.length > 0);
  return { status: 'partial', backupTag, autoResolved, manualFiles };
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
