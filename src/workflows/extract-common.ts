import { createBranchResolver } from '../core/branch-resolver.js';
import { createGitClient } from '../core/git-client.js';
import { createWorkingTreeInspector } from '../core/working-tree.js';
import { createGitLabProvider } from '../providers/gitlab-provider.js';
import type { Config, ExtractOptions, ExtractResult, Logger } from '../types.js';
import { buildCommonPathspec } from '../utils/common-pathspec.js';
import {
  buildCommonBranchName,
  buildExtractCommitMessage,
  buildMergeRequestDescription,
  buildMergeRequestTitle,
  formatExtractTimestamp,
} from '../utils/extract-labels.js';
import { createTempDir, safeRemove, writeTempFile } from '../utils/temp-workspace.js';

export function runExtractCommonWorkflow({
  config,
  logger,
  options = {},
}: {
  config: Config;
  logger: Logger;
  options?: ExtractOptions;
}): ExtractResult {
  const git = createGitClient();
  const branches = createBranchResolver({ git, config });
  const workingTree = createWorkingTreeInspector({ git });
  const provider = createGitLabProvider({ git, config, logger });

  logger.info('Running pre-flight checks...');

  if (!workingTree.isGitRepository()) {
    throw new Error('Not inside a git repository.');
  }

  const featureBranch = branches.resolve(options.branch);
  branches.ensureFeatureBranch(featureBranch);

  if (options.branch) {
    branches.ensureRemoteExists(featureBranch);
  }

  workingTree.assertClean();

  logger.info(`Feature branch: ${featureBranch}`);
  branches.checkout(featureBranch);
  logger.ok(`Checked out '${featureBranch}'.`);

  const rootRef = `${config.remote}/${config.rootBranch}`;

  logger.info(`Fetching ${rootRef}...`);
  git.runOrThrow(['fetch', config.remote, config.rootBranch]);

  const mergeBase = git.runOrThrow(['merge-base', rootRef, 'HEAD']).trim();
  const rootTip = git.runOrThrow(['rev-parse', rootRef]).trim();

  if (mergeBase !== rootTip) {
    const behind = git.runOrThrow(['rev-list', '--count', `HEAD..${rootRef}`]).trim();
    throw new Error(
      [
        `Feature branch is ${behind} commit(s) behind '${rootRef}'.`,
        'Sync first, then retry:',
        `  git checkout ${featureBranch}`,
        `  git merge ${rootRef}`,
        '  git push',
      ].join('\n'),
    );
  }

  logger.ok('Sync check passed.');

  const pathspec = buildCommonPathspec(config);
  const changedFiles = git
    .runOrThrow(['diff', '--name-only', `${mergeBase}..HEAD`, '--', ...pathspec])
    .split('\n')
    .filter(Boolean);

  if (changedFiles.length === 0) {
    logger.ok('No common changes detected. Nothing to extract.');
    return { status: 'noop' };
  }

  logger.info(`Found ${changedFiles.length.toString()} common file(s):`);
  changedFiles.forEach((file) => {
    logger.plain(`  - ${file}`);
  });

  const patchContent = git.runOrThrow([
    'diff',
    '--binary',
    `${mergeBase}..HEAD`,
    '--',
    ...pathspec,
  ]);

  const timestamp = formatExtractTimestamp(new Date());
  const commonBranch = buildCommonBranchName(featureBranch, timestamp, config);

  logger.info(`Patch size: ${patchContent.length.toString()} bytes`);
  logger.info(`Target common branch: ${commonBranch}`);

  if (options.dryRun) {
    logger.ok(`[DRY-RUN] Would create '${commonBranch}' from '${rootRef}' and apply the patch.`);
    return { status: 'extracted', commonBranch, files: changedFiles };
  }

  const patchFile = writeTempFile('common-extract', patchContent);
  const worktreeDir = createTempDir('common-wt');

  let keepWorktree = false;
  const cleanup = (): void => {
    if (keepWorktree) return;
    safeRemove(patchFile);
    git.run(['worktree', 'remove', '--force', worktreeDir]);
    safeRemove(worktreeDir);
  };

  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });

  try {
    logger.info(`Creating worktree at: ${worktreeDir}`);
    git.runOrThrow(['worktree', 'add', '-b', commonBranch, worktreeDir, rootRef]);

    logger.info('Applying patch...');
    const applyResult = git.run(['apply', '--3way', '--whitespace=nowarn', patchFile], {
      cwd: worktreeDir,
    });

    if (!applyResult.ok) {
      keepWorktree = true;
      throw new Error(
        [
          'Patch application failed due to conflicts.',
          applyResult.stderr,
          'Resolve manually:',
          `  1. cd "${worktreeDir}"`,
          '  2. Fix conflicts, then run: git add . && git commit',
          `  3. git push -u ${config.remote} ${commonBranch}`,
          `  4. git worktree remove "${worktreeDir}"`,
        ].join('\n'),
      );
    }

    const commitMessage = buildExtractCommitMessage({
      featureBranch,
      commonBranch,
      timestamp,
      changedFiles,
      mergeBase,
      rootBranch: config.rootBranch,
    });
    git.runOrThrow(['add', '-A'], { cwd: worktreeDir });
    git.runOrThrow(['commit', '-m', commitMessage], { cwd: worktreeDir });
    logger.ok(`Committed on '${commonBranch}'.`);

    logger.info(`Pushing to ${config.remote}...`);
    git.runOrThrow(['push', '-u', config.remote, commonBranch], { cwd: worktreeDir });
    logger.ok(`Pushed: ${config.remote}/${commonBranch}`);

    if (options.skipMergeRequest === true || config.mergeRequestProvider === 'none') {
      const url = provider.buildMergeRequestUrl(commonBranch);
      logger.warn('Merge request creation skipped. URL:');
      logger.plain(`  ${url}`);
    } else {
      provider.createMergeRequest({
        sourceBranch: commonBranch,
        title: buildMergeRequestTitle(featureBranch, timestamp),
        description: buildMergeRequestDescription({
          featureBranch,
          commonBranch,
          changedFiles,
          mergeBase,
          rootBranch: config.rootBranch,
        }),
        cwd: worktreeDir,
      });
    }

    return { status: 'extracted', commonBranch, files: changedFiles };
  } finally {
    cleanup();
  }
}
