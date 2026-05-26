import { createGitClient } from '../core/git-client.js';
import { GitControlsError } from '../errors.js';
import type { Config, Logger } from '../types.js';

export interface UndoOptions {
  count?: number;
  hard?: boolean;
}

export function runUndoWorkflow({
  config,
  logger,
  options = {},
}: {
  config: Config;
  logger: Logger;
  options?: UndoOptions;
}): void {
  const git = createGitClient();
  const count = options.count ?? 1;
  const mode = options.hard === true ? 'hard' : 'soft';

  if (count < 1) throw new GitControlsError('--count must be at least 1.');

  const currentBranch = git.runOrThrow(['branch', '--show-current']).trim();
  if (!currentBranch) throw new GitControlsError('Detached HEAD — checkout a branch first.');

  // Safety: ensure we're not trying to undo commits already on the remote
  const remoteRef = `${config.remote}/${currentBranch}`;
  const hasRemote = git.run(['rev-parse', '--verify', remoteRef]).ok;
  if (hasRemote) {
    const ahead = Number(git.runOrThrow(['rev-list', '--count', `${remoteRef}..HEAD`]).trim());
    if (ahead < count) {
      throw new GitControlsError(
        `Only ${ahead.toString()} of the ${count.toString()} targeted commits are unpushed.`,
        [
          `The remaining ${(count - ahead).toString()} commit(s) are already on '${remoteRef}'.`,
          `To revert pushed commits safely, use: yarn git:revert-commit <hash>`,
        ],
      );
    }
  }

  logger.info(`Undoing ${count.toString()} commit(s) with --${mode} reset...`);
  git.runOrThrow(['reset', `--${mode}`, `HEAD~${count.toString()}`]);

  if (mode === 'soft') {
    logger.ok(`Done. ${count.toString()} commit(s) undone — changes are still staged.`);
    logger.plain('  Review: git status');
    logger.plain('  Re-commit: git commit -m "your message"');
  } else {
    logger.ok(`Done. ${count.toString()} commit(s) and their changes discarded.`);
    logger.plain('  Working tree is clean.');
  }
}
