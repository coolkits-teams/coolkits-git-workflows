import { createBranchResolver } from '../core/branch-resolver.js';
import { createGitClient } from '../core/git-client.js';
import { createWorkingTreeInspector } from '../core/working-tree.js';
import type { Config, GitClient, Logger, SyncOptions, SyncResult } from '../types.js';

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

  const featureBranch = branches.resolve(options.branch);
  branches.ensureFeatureBranch(featureBranch);
  workingTree.assertClean();

  logger.info(`Feature branch: ${featureBranch}`);
  branches.checkout(featureBranch);

  const rootRef = `${config.remote}/${config.rootBranch}`;

  logger.info(`Fetching ${rootRef}...`);
  git.runOrThrow(['fetch', config.remote, config.rootBranch]);

  const behind = Number(git.runOrThrow(['rev-list', '--count', `HEAD..${rootRef}`]));
  const ahead = Number(git.runOrThrow(['rev-list', '--count', `${rootRef}..HEAD`]));

  logger.info(
    `Branch status vs ${rootRef}: ahead=${ahead.toString()}, behind=${behind.toString()}`,
  );

  if (behind === 0) {
    logger.ok(`'${featureBranch}' is already up to date with '${rootRef}'.`);
    return { status: 'up-to-date' };
  }

  logger.info(`${behind.toString()} commit(s) from '${rootRef}' will be merged:`);
  git
    .run(['log', '--oneline', '--no-decorate', `HEAD..${rootRef}`])
    .stdout.split('\n')
    .filter(Boolean)
    .forEach((commit) => {
      logger.plain(`  ${commit}`);
    });

  const backupTag = createBackupTag(git, featureBranch);
  logger.info(`Backup tag created: ${backupTag}`);
  logger.info(`Rollback command:   git reset --hard ${backupTag}`);

  logger.info(`Merging '${rootRef}' into '${featureBranch}'...`);
  const mergeResult = git.run(['merge', '--no-edit', rootRef], { stdio: 'inherit' });

  if (!mergeResult.ok) {
    throw new Error(
      [
        'Merge failed due to conflicts. Resolve manually:',
        '  1. Fix files listed by git status',
        '  2. git add <file>',
        '  3. git commit',
        `Or abort: git merge --abort && git tag -d ${backupTag}`,
      ].join('\n'),
    );
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

function createBackupTag(git: GitClient, branch: string): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.TZ-]/g, '')
    .slice(0, 15);
  const tagName = `backup/${branch.replace(/\//g, '-')}-${timestamp}`;
  git.runOrThrow(['tag', tagName]);
  return tagName;
}
