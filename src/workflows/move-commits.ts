import { createGitClient } from '../core/git-client.js';
import { GitControlsError } from '../errors.js';
import type { Config, Logger } from '../types.js';

export interface MoveCommitsOptions {
  to: string;
  count?: number;
}

/**
 * Move the last N unpushed commits from the current branch to a target branch.
 *
 * Strategy:
 *   1. Collect the hashes to cherry-pick.
 *   2. Hard-reset the current branch back N commits.
 *   3. Checkout (or create) the target branch.
 *   4. Cherry-pick the collected commits onto the target branch.
 */
export function runMoveCommitsWorkflow({
  config,
  logger,
  options,
}: {
  config: Config;
  logger: Logger;
  options: MoveCommitsOptions;
}): void {
  const git = createGitClient();
  const count = options.count ?? 1;

  if (count < 1) throw new GitControlsError('--count must be at least 1.');

  const sourceBranch = git.runOrThrow(['branch', '--show-current']).trim();
  if (!sourceBranch) throw new GitControlsError('Detached HEAD — checkout a branch first.');

  if (sourceBranch === options.to) {
    throw new GitControlsError(`Source and target are the same branch: '${sourceBranch}'.`);
  }

  // Safety: all commits being moved must be unpushed
  const remoteRef = `${config.remote}/${sourceBranch}`;
  const hasRemote = git.run(['rev-parse', '--verify', remoteRef]).ok;
  if (hasRemote) {
    const ahead = Number(git.runOrThrow(['rev-list', '--count', `${remoteRef}..HEAD`]).trim());
    if (ahead < count) {
      throw new GitControlsError(
        `Only ${ahead.toString()} of the ${count.toString()} commits are unpushed on '${sourceBranch}'.`,
        ['Moving pushed commits rewrites shared history — do that manually.'],
      );
    }
  }

  // Collect hashes (oldest first)
  const hashes = git
    .runOrThrow(['log', '--format=%H', `-${count.toString()}`])
    .split('\n')
    .filter(Boolean)
    .reverse();

  const subjects = git
    .runOrThrow(['log', '--format=%s', `-${count.toString()}`])
    .split('\n')
    .filter(Boolean)
    .reverse();

  logger.info(`Moving ${count.toString()} commit(s) from '${sourceBranch}' → '${options.to}':`);
  subjects.forEach((s) => {
    logger.plain(`  - ${s}`);
  });

  // Remove commits from source branch
  git.runOrThrow(['reset', '--hard', `HEAD~${count.toString()}`]);
  logger.ok(`Removed from '${sourceBranch}'.`);

  // Checkout or create target branch
  const targetLocalExists = git.run(['show-ref', '--verify', `refs/heads/${options.to}`]).ok;
  const targetRemoteExists = git.run([
    'rev-parse',
    '--verify',
    `${config.remote}/${options.to}`,
  ]).ok;

  if (targetLocalExists) {
    git.runOrThrow(['checkout', options.to]);
  } else if (targetRemoteExists) {
    git.runOrThrow(['checkout', '-b', options.to, `${config.remote}/${options.to}`]);
  } else {
    git.runOrThrow(['checkout', '-b', options.to]);
    logger.warn(`Created new local branch '${options.to}'.`);
  }

  // Cherry-pick commits onto target
  for (const hash of hashes) {
    const result = git.run(['cherry-pick', hash], { stdio: 'inherit' });
    if (!result.ok) {
      throw new GitControlsError(`Cherry-pick failed on commit ${hash.slice(0, 8)}.`, [
        'Resolve conflicts, then run: git cherry-pick --continue',
        `Remaining commits to pick: ${hashes.slice(hashes.indexOf(hash) + 1).join(', ')}`,
      ]);
    }
  }

  logger.ok(`${count.toString()} commit(s) moved to '${options.to}'. Now on '${options.to}'.`);
  logger.plain(`  Original branch '${sourceBranch}' rolled back ${count.toString()} commit(s).`);
}
