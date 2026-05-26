import { createGitClient } from '../core/git-client.js';
import { GitControlsError } from '../errors.js';
import type { Logger } from '../types.js';

export interface RecoverBranchOptions {
  branch: string;
  /** Explicit commit hash to restore from (skips reflog search). */
  from?: string | null;
}

export function runRecoverBranchWorkflow({
  logger,
  options,
}: {
  logger: Logger;
  options: RecoverBranchOptions;
}): void {
  const git = createGitClient();
  const { branch } = options;

  // Make sure the branch doesn't already exist
  const alreadyExists = git.run(['show-ref', '--verify', `refs/heads/${branch}`]).ok;
  if (alreadyExists) {
    throw new GitControlsError(`Branch '${branch}' already exists — nothing to recover.`);
  }

  let commitHash: string;

  if (options.from != null && options.from.trim() !== '') {
    // User provided an explicit commit
    const verify = git.run(['rev-parse', '--verify', options.from]);
    if (!verify.ok) {
      throw new GitControlsError(`Commit '${options.from}' not found in this repository.`);
    }
    commitHash = git.runOrThrow(['rev-parse', options.from]).trim();
    logger.info(`Restoring '${branch}' from provided commit ${commitHash.slice(0, 8)}...`);
  } else {
    // Search reflog for the last time this branch was HEAD or referenced
    logger.info(`Searching reflog for '${branch}'...`);
    const reflog = git.run(['reflog', '--all', '--format=%H %gs']);
    const line = reflog.stdout
      .split('\n')
      .find(
        (l) =>
          l.includes(`checkout: moving from ${branch}`) ||
          l.includes(`branch: created from`) ||
          l.includes(`Branch: renamed refs/heads/${branch}`),
      );

    // Fallback: search for the branch name in reflog entries
    const fallbackLine = reflog.stdout.split('\n').find((l) => l.includes(branch));

    const candidateLine = line ?? fallbackLine;
    const match = candidateLine?.match(/^([0-9a-f]{40})/);
    if (!match) {
      throw new GitControlsError(`Could not find '${branch}' in reflog.`, [
        'The branch may have been deleted too long ago (reflog expires after 90 days by default).',
        'Try: git reflog --all | grep <branch-name>',
        'Then: git-recover-branch <branch> --from <commit-hash>',
      ]);
    }

    commitHash = match[1] ?? '';
    logger.info(`Found in reflog: ${commitHash.slice(0, 8)}`);
  }

  git.runOrThrow(['checkout', '-b', branch, commitHash]);
  logger.ok(`Branch '${branch}' restored from ${commitHash.slice(0, 8)}.`);
  logger.plain(`  You are now on '${branch}'.`);
  logger.plain(`  Verify with: git log --oneline -5`);
}
