import { createGitClient } from '../core/git-client.js';
import { createWorkingTreeInspector } from '../core/working-tree.js';
import { GitControlsError } from '../errors.js';
import type { Config, Logger } from '../types.js';

export interface RenameBranchOptions {
  /** New branch name (required). */
  newName: string;
  /** Branch to rename. Default: current branch. */
  branch?: string | null;
  /** Skip remote update (local rename only). */
  noRemote?: boolean;
}

export interface RenameBranchResult {
  status: 'renamed';
  oldName: string;
  newName: string;
}

export function runRenameBranchWorkflow({
  config,
  logger,
  options,
}: {
  config: Config;
  logger: Logger;
  options: RenameBranchOptions;
}): RenameBranchResult {
  const git = createGitClient();
  const workingTree = createWorkingTreeInspector({ git });

  workingTree.assertClean();

  const currentBranch = git.runOrThrow(['branch', '--show-current']).trim();
  const oldName = options.branch?.trim() ?? currentBranch;
  const newName = options.newName.trim();

  if (!newName) throw new GitControlsError('New branch name is required.');
  if (oldName === newName) throw new GitControlsError(`Branch is already named '${newName}'.`);

  if (config.protectedBranches.includes(oldName)) {
    throw new GitControlsError(`Cannot rename protected branch '${oldName}'.`);
  }

  const localExists = git.run(['show-ref', '--verify', `refs/heads/${oldName}`]).ok;
  if (!localExists) {
    throw new GitControlsError(`Branch '${oldName}' does not exist locally.`);
  }

  // Local rename
  logger.info(`Renaming '${oldName}' → '${newName}'...`);
  git.runOrThrow(['branch', '-m', oldName, newName]);
  logger.ok(`Local branch renamed.`);

  if (options.noRemote !== true) {
    const remoteRef = `refs/remotes/${config.remote}/${oldName}`;
    const hasOldRemote = git.run(['show-ref', '--verify', remoteRef]).ok;

    if (hasOldRemote) {
      logger.info(`Pushing '${newName}' to ${config.remote}...`);
      git.runOrThrow(['push', '-u', config.remote, newName], { stdio: 'inherit' });
      logger.info(`Deleting old remote '${config.remote}/${oldName}'...`);
      git.runOrThrow(['push', config.remote, '--delete', oldName], { stdio: 'inherit' });
      logger.ok(`Remote updated: ${config.remote}/${newName}`);
    } else {
      logger.warn(
        `No remote branch '${config.remote}/${oldName}' found — skipped remote update.`,
      );
    }
  }

  // Ensure tracking is set if we're on the renamed branch
  if (oldName === currentBranch) {
    const trackingSet = git.run([
      'rev-parse',
      '--verify',
      `${config.remote}/${newName}`,
    ]).ok;
    if (trackingSet) {
      git.run(['branch', `--set-upstream-to=${config.remote}/${newName}`, newName]);
    }
    logger.plain(`  Now on: ${newName}`);
  }

  logger.ok(`Done. Branch renamed: ${oldName} → ${newName}`);
  return { status: 'renamed', oldName, newName };
}
