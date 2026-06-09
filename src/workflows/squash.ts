import { createGitClient } from '../core/git-client.js';
import { GitControlsError } from '../errors.js';
import type { Config, Logger } from '../types.js';

export interface SquashOptions {
  count: number;
  message?: string | null;
  force?: boolean;
}

export function runSquashWorkflow({
  config,
  logger,
  options,
}: {
  config: Config;
  logger: Logger;
  options: SquashOptions;
}): void {
  const git = createGitClient();
  const { count } = options;

  if (count < 2) throw new GitControlsError('--count must be at least 2 to squash.');

  const currentBranch = git.runOrThrow(['branch', '--show-current']).trim();
  if (!currentBranch) throw new GitControlsError('Detached HEAD — checkout a branch first.');

  // Safety check: ensure all squashed commits are unpushed
  const remoteRef = `${config.remote}/${currentBranch}`;
  const hasRemote = git.run(['rev-parse', '--verify', remoteRef]).ok;
  if (hasRemote) {
    const ahead = Number(git.runOrThrow(['rev-list', '--count', `${remoteRef}..HEAD`]).trim());
    if (ahead < count && !options.force) {
      const canSquash = ahead;
      throw new GitControlsError(
        `Only ${canSquash.toString()} of the ${count.toString()} commits are unpushed.`,
        [
          'Squashing pushed commits rewrites shared history.',
          `Use --count ${canSquash.toString()} to squash only the unpushed commits,`,
          'or pass --force to squash + force-push (notify your team first).',
        ],
      );
    }
  }

  // Collect the commit subjects for a combined message
  const subjects = git
    .runOrThrow(['log', '--format=%s', `-${count.toString()}`])
    .split('\n')
    .filter(Boolean)
    .reverse();

  const message =
    options.message?.trim() !== '' && options.message != null
      ? options.message
      : subjects.join('\n');

  logger.info(`Squashing ${count.toString()} commits into one...`);
  logger.plain('  Commits being squashed:');
  subjects.forEach((s) => {
    logger.plain(`    - ${s}`);
  });

  // Soft-reset N commits, then recommit with combined message
  git.runOrThrow(['reset', '--soft', `HEAD~${count.toString()}`]);
  git.runOrThrow(['commit', '--message', message], { stdio: 'inherit' });

  logger.ok(`${count.toString()} commits squashed into one.`);
  logger.plain(`  Message: "${message.split('\n')[0] ?? message}"`);

  if (options.force === true) {
    logger.warn(
      `Force-pushing '${currentBranch}' to ${config.remote}. Notify collaborators to run: git pull --rebase`,
    );
    git.runOrThrow(['push', '--force-with-lease', config.remote, currentBranch], {
      stdio: 'inherit',
    });
    logger.ok(`Force-pushed to ${config.remote}/${currentBranch}.`);
  }
}
