import { createGitClient } from '../core/git-client.js';
import { GitControlsError } from '../errors.js';
import type { Config, Logger } from '../types.js';

export interface RevertCommitOptions {
  commit: string;
  skipPush?: boolean;
}

export function runRevertCommitWorkflow({
  config,
  logger,
  options,
}: {
  config: Config;
  logger: Logger;
  options: RevertCommitOptions;
}): void {
  const git = createGitClient();
  const { commit } = options;

  // Verify the commit exists
  const verifyResult = git.run(['rev-parse', '--verify', commit]);
  if (!verifyResult.ok) {
    throw new GitControlsError(`Commit '${commit}' not found in this repository.`);
  }

  const shortHash = git.runOrThrow(['rev-parse', '--short', commit]).trim();
  const subject = git.runOrThrow(['log', '--format=%s', '-1', commit]).trim();

  logger.info(`Reverting commit ${shortHash}: "${subject}"`);
  logger.info('This creates a new commit that undoes the changes (safe for shared branches).');

  const result = git.run(['revert', '--no-edit', commit], { stdio: 'inherit' });
  if (!result.ok) {
    throw new GitControlsError('Revert failed — merge conflict detected.', [
      'Resolve the conflicts, then run:',
      '  git add .',
      '  git revert --continue',
      'Or abort with: git revert --abort',
    ]);
  }

  logger.ok(`Revert commit created.`);

  if (!options.skipPush) {
    const currentBranch = git.runOrThrow(['branch', '--show-current']).trim();
    logger.info(`Pushing to ${config.remote}/${currentBranch}...`);
    git.runOrThrow(['push', config.remote, currentBranch], { stdio: 'inherit' });
    logger.ok(`Pushed to ${config.remote}/${currentBranch}.`);
  }
}
