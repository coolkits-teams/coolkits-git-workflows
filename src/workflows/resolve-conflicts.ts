import { createGitClient } from '../core/git-client.js';
import { GitControlsError } from '../errors.js';
import type { Logger } from '../types.js';

export interface ResolveConflictsOptions {
  strategy: 'theirs' | 'ours';
  /** Resolve only specific file(s). Default: all conflicted files. */
  files?: string[];
}

export function runResolveConflictsWorkflow({
  logger,
  options,
}: {
  logger: Logger;
  options: ResolveConflictsOptions;
}): void {
  const git = createGitClient();

  // Find conflicted files
  const conflicted = git
    .runOrThrow(['diff', '--name-only', '--diff-filter=U'])
    .split('\n')
    .filter(Boolean);

  if (conflicted.length === 0) {
    throw new GitControlsError(
      'No conflicted files found. Are you in the middle of a merge/rebase?',
    );
  }

  const targets = (options.files?.length ?? 0) > 0 ? (options.files ?? conflicted) : conflicted;

  // Validate provided files are actually conflicted
  for (const file of targets) {
    if (!conflicted.includes(file)) {
      throw new GitControlsError(`'${file}' is not a conflicted file.`, [
        `Conflicted files: ${conflicted.join(', ')}`,
      ]);
    }
  }

  const { strategy } = options;
  logger.info(
    `Resolving ${targets.length.toString()} conflicted file(s) using '${strategy}' strategy...`,
  );

  // git checkout --theirs/--ours resolves by taking one side completely
  git.runOrThrow(['checkout', `--${strategy}`, '--', ...targets]);
  git.runOrThrow(['add', '--', ...targets]);

  logger.ok(`Resolved ${targets.length.toString()} file(s) using '${strategy}'.`);
  targets.forEach((f) => {
    logger.plain(`  ✓ ${f}`);
  });

  const remaining = conflicted.filter((f) => !targets.includes(f));
  if (remaining.length > 0) {
    logger.warn(`${remaining.length.toString()} file(s) still conflicted:`);
    remaining.forEach((f) => {
      logger.plain(`  - ${f}`);
    });
  } else {
    logger.plain('');
    logger.plain('All conflicts resolved. Complete the operation:');
    logger.plain('  git commit         (for merge)');
    logger.plain('  git rebase --continue  (for rebase)');
    logger.plain('  git cherry-pick --continue  (for cherry-pick)');
  }
}
