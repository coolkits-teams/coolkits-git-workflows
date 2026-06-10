import { createGitClient } from '../core/git-client.js';
import { GitControlsError } from '../errors.js';
import type { Config, Logger } from '../types.js';

export interface WipOptions {
  /** Custom message suffix. Default: auto timestamp. */
  message?: string | null;
  /** Undo the last WIP commit (soft-reset). */
  pop?: boolean;
  /** Push to remote after saving. */
  push?: boolean;
}

export interface WipResult {
  status: 'saved' | 'popped' | 'nothing';
  message?: string;
}

export function runWipWorkflow({
  config,
  logger,
  options = {},
}: {
  config: Config;
  logger: Logger;
  options?: WipOptions;
}): WipResult {
  const git = createGitClient();

  if (options.pop) {
    const lastMsg = git.runOrThrow(['log', '-1', '--format=%s']).trim();
    if (!lastMsg.startsWith('wip:') && !lastMsg.startsWith('WIP:')) {
      throw new GitControlsError('Last commit does not look like a WIP commit.', [
        `Last commit: "${lastMsg}"`,
        'Only use --pop on commits created by coolkit wip.',
      ]);
    }

    const branch = git.runOrThrow(['branch', '--show-current']).trim();
    const remoteRef = `${config.remote}/${branch}`;
    const hasRemote = git.run(['rev-parse', '--verify', remoteRef]).ok;
    if (hasRemote) {
      const ahead = Number(git.runOrThrow(['rev-list', '--count', `${remoteRef}..HEAD`]).trim());
      if (ahead === 0) {
        throw new GitControlsError('WIP commit is already pushed to remote.', [
          'Undo manually:',
          `  git reset --soft HEAD~1`,
          `  git push --force-with-lease ${config.remote} ${branch}`,
        ]);
      }
    }

    git.runOrThrow(['reset', '--soft', 'HEAD~1']);
    logger.ok(`WIP commit popped. Files are back in the working tree (unstaged).`);
    return { status: 'popped', message: lastMsg };
  }

  const dirty = git.run(['status', '--porcelain']).stdout.trim();
  if (!dirty) {
    logger.warn('Nothing to save — working tree is already clean.');
    return { status: 'nothing' };
  }

  git.runOrThrow(['add', '-A']);

  const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const msg =
    options.message?.trim() != null && options.message.trim() !== ''
      ? `wip: ${options.message.trim()}`
      : `wip: save work at ${timestamp}`;

  git.runOrThrow(['commit', '-m', msg]);
  logger.ok(`WIP saved: "${msg}"`);
  logger.plain(`  Undo with: coolkit wip --pop`);

  if (options.push === true) {
    const branch = git.runOrThrow(['branch', '--show-current']).trim();
    logger.info(`Pushing '${branch}' to ${config.remote}...`);
    git.runOrThrow(['push', '--force-with-lease', config.remote, branch], { stdio: 'inherit' });
    logger.ok(`Pushed.`);
  }

  return { status: 'saved', message: msg };
}
