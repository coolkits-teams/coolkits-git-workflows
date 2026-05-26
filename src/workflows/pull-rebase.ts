import { createGitClient } from '../core/git-client.js';
import { GitControlsError } from '../errors.js';
import type { Config, Logger } from '../types.js';

export interface PullRebaseOptions {
  branch?: string | null;
}

export function runPullRebaseWorkflow({
  config,
  logger,
  options = {},
}: {
  config: Config;
  logger: Logger;
  options?: PullRebaseOptions;
}): void {
  const git = createGitClient();

  const currentBranch = git.runOrThrow(['branch', '--show-current']).trim();
  if (!currentBranch) throw new GitControlsError('Detached HEAD — checkout a branch first.');

  const branch = options.branch ?? currentBranch;

  logger.info(`Pulling ${config.remote}/${branch} with rebase (no merge commit)...`);

  const result = git.run(['pull', '--rebase', config.remote, branch], { stdio: 'inherit' });

  if (!result.ok) {
    throw new GitControlsError('Pull rebase failed — conflict detected.', [
      'Resolve the conflicts, then run:',
      '  git add .',
      '  git rebase --continue',
      'Or abort with: git rebase --abort',
    ]);
  }

  logger.ok(`Rebased onto ${config.remote}/${branch}. No merge commit created.`);
}
