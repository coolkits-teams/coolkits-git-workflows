import { createGitClient } from '../core/git-client.js';
import { GitControlsError } from '../errors.js';
import type { Config, Logger } from '../types.js';

export interface PurgeFileOptions {
  file: string;
  dryRun?: boolean;
  skipBackup?: boolean;
}

/**
 * Permanently removes a file from the entire git history.
 *
 * ⚠️  DESTRUCTIVE — rewrites all commits that touched the file.
 *     All collaborators must re-clone or hard-reset after the force-push.
 *
 * Uses `git filter-branch` (built-in).
 * For large repos, install `git-filter-repo` and use it directly for better performance.
 */
export function runPurgeFileWorkflow({
  config,
  logger,
  options,
}: {
  config: Config;
  logger: Logger;
  options: PurgeFileOptions;
}): void {
  const git = createGitClient();
  const { file } = options;

  // Check if the file ever existed in history
  const historyCheck = git.run(['log', '--all', '--oneline', '--', file]);
  if (!historyCheck.stdout.trim()) {
    throw new GitControlsError(`File '${file}' was never tracked in this repository's history.`);
  }

  const commitCount = historyCheck.stdout.trim().split('\n').length;

  logger.warn('⚠️  DESTRUCTIVE OPERATION — this rewrites git history permanently.');
  logger.warn(`File:     ${file}`);
  logger.warn(`Affects:  ${commitCount.toString()} commit(s) across all branches.`);
  logger.warn('After this you MUST force-push ALL branches and ALL collaborators must re-clone.');

  if (options.dryRun === true) {
    logger.plain('');
    logger.ok('[DRY-RUN] Would purge the file listed above. Run without --dry-run to proceed.');
    logger.plain('');
    logger.plain('Commits that reference this file:');
    historyCheck.stdout
      .trim()
      .split('\n')
      .slice(0, 10)
      .forEach((line) => {
        logger.plain(`  ${line}`);
      });
    if (commitCount > 10) logger.plain(`  ... and ${(commitCount - 10).toString()} more`);
    return;
  }

  // Create a backup tag before rewriting
  if (options.skipBackup !== true) {
    const timestamp = Date.now().toString();
    const backupTag = `backup/before-purge-${timestamp}`;
    git.runOrThrow(['tag', backupTag]);
    logger.info(`Backup tag created: ${backupTag} (delete with: git tag -d ${backupTag})`);
  }

  logger.info('Rewriting history with git filter-branch...');
  logger.info('This may take a while on large repositories.');

  const result = git.run(
    [
      'filter-branch',
      '--force',
      '--index-filter',
      `git rm --cached --ignore-unmatch "${file}"`,
      '--prune-empty',
      '--tag-name-filter',
      'cat',
      '--',
      '--all',
    ],
    { stdio: 'inherit' },
  );

  if (!result.ok) {
    throw new GitControlsError('git filter-branch failed. See output above.');
  }

  logger.ok(`File '${file}' removed from all history.`);
  logger.plain('');
  logger.warn('NEXT STEPS (required):');
  logger.plain(`  1. Force-push all branches:`);
  logger.plain(`       git push ${config.remote} --force --all`);
  logger.plain(`       git push ${config.remote} --force --tags`);
  logger.plain(`  2. Notify ALL collaborators to re-clone or run:`);
  logger.plain(`       git fetch --all`);
  logger.plain(`       git reset --hard ${config.remote}/<their-branch>`);
  logger.plain(`  3. Add '${file}' to .gitignore to prevent re-commit.`);
  logger.plain(`  4. If it was a secret (API key, password), ROTATE IT NOW.`);
}
