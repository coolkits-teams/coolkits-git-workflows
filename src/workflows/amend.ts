import { createGitClient } from '../core/git-client.js';
import { GitControlsError } from '../errors.js';
import type { Config, Logger } from '../types.js';

export interface AmendOptions {
  /** New commit message. Required when changing message without other changes. */
  message?: string | null;
  /** Files to add to the last commit before amending. */
  add?: string[];
  /** Files to remove from the last commit (unstage from commit, keep locally). */
  remove?: string[];
  /**
   * Force-push after amend.
   * Only safe when no one else has pulled this commit.
   */
  force?: boolean;
}

export function runAmendWorkflow({
  config,
  logger,
  options = {},
}: {
  config: Config;
  logger: Logger;
  options?: AmendOptions;
}): void {
  const git = createGitClient();
  const hasMessage = options.message != null && options.message.trim() !== '';
  const hasAdd = (options.add?.length ?? 0) > 0;
  const hasRemove = (options.remove?.length ?? 0) > 0;

  if (!hasMessage && !hasAdd && !hasRemove) {
    throw new GitControlsError('Nothing to amend. Provide --message, --add, or --remove.');
  }

  // Stage files to add
  if (hasAdd) {
    for (const file of options.add ?? []) {
      logger.info(`Staging: ${file}`);
      git.runOrThrow(['add', file]);
    }
  }

  // Unstage files to remove from the commit (keep the files locally)
  if (hasRemove) {
    for (const file of options.remove ?? []) {
      logger.info(`Removing from commit (keeping locally): ${file}`);
      git.runOrThrow(['reset', 'HEAD', file]);
    }
  }

  // Amend
  const amendArgs = ['commit', '--amend'];
  if (hasMessage && options.message != null) {
    amendArgs.push('--message', options.message);
  } else {
    amendArgs.push('--no-edit');
  }

  const result = git.run(amendArgs, { stdio: 'inherit' });
  if (!result.ok) {
    throw new GitControlsError('Amend failed. See output above.');
  }

  logger.ok('Last commit amended.');

  if (options.force === true) {
    const currentBranch = git.runOrThrow(['branch', '--show-current']).trim();
    logger.warn(
      `Force-pushing '${currentBranch}' to ${config.remote}. Collaborators who pulled this commit must run: git pull --rebase`,
    );
    git.runOrThrow(['push', '--force-with-lease', config.remote, currentBranch], {
      stdio: 'inherit',
    });
    logger.ok(`Force-pushed to ${config.remote}/${currentBranch}.`);
  } else {
    const currentBranch = git.runOrThrow(['branch', '--show-current']).trim();
    const hasRemoteBranch = git.run([
      'rev-parse',
      '--verify',
      `${config.remote}/${currentBranch}`,
    ]).ok;
    if (hasRemoteBranch) {
      logger.warn(
        `This branch exists on ${config.remote}. If you already pushed, use --force to force-push.`,
      );
    }
  }
}
