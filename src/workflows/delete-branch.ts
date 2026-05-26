import { createGitClient } from '../core/git-client.js';
import { GitControlsError } from '../errors.js';
import type { Config, Logger } from '../types.js';

export interface DeleteBranchOptions {
  branch: string;
  remoteOnly?: boolean;
  localOnly?: boolean;
  force?: boolean;
}

export function runDeleteBranchWorkflow({
  config,
  logger,
  options,
}: {
  config: Config;
  logger: Logger;
  options: DeleteBranchOptions;
}): void {
  const git = createGitClient();
  const { branch } = options;

  // Don't delete the currently checked-out branch
  const currentBranch = git.runOrThrow(['branch', '--show-current']).trim();
  if (currentBranch === branch) {
    throw new GitControlsError(
      `Cannot delete '${branch}' — it is your currently checked-out branch.`,
      ['Switch to another branch first, then retry.'],
    );
  }

  const deleteLocal = options.remoteOnly !== true;
  const deleteRemote = options.localOnly !== true;

  // ── Local deletion ───────────────────────────────────────────────────────
  if (deleteLocal) {
    const localExists = git.run(['show-ref', '--verify', `refs/heads/${branch}`]).ok;
    if (localExists) {
      const flag = options.force === true ? '-D' : '-d';
      const result = git.run(['branch', flag, branch]);
      if (!result.ok) {
        throw new GitControlsError(`Failed to delete local branch '${branch}'.`, [
          result.stderr,
          'Use --force if the branch has unmerged commits.',
        ]);
      }
      logger.ok(`Deleted local branch '${branch}'.`);
    } else {
      logger.warn(`Local branch '${branch}' not found — skipping local deletion.`);
    }
  }

  // ── Remote deletion ──────────────────────────────────────────────────────
  if (deleteRemote) {
    const remoteExists = git
      .run(['ls-remote', '--heads', config.remote, branch])
      .stdout.includes(branch);
    if (remoteExists) {
      logger.info(`Deleting remote branch ${config.remote}/${branch}...`);
      git.runOrThrow(['push', config.remote, '--delete', branch], { stdio: 'inherit' });
      logger.ok(`Deleted remote branch ${config.remote}/${branch}.`);
    } else {
      logger.warn(`Remote branch '${config.remote}/${branch}' not found — skipping.`);
    }
  }
}
