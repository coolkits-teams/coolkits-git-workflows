import { createGitClient } from '../core/git-client.js';
import { GitControlsError } from '../errors.js';
import type { Logger } from '../types.js';

export interface CherryPickOptions {
  /** Single commit hash or the start of a range (oldest). */
  commit: string;
  /** End of range (newest). When provided, picks all commits from `commit` to `rangeTo`. */
  rangeTo?: string | null;
  /** Do not commit automatically — leave changes staged for review. */
  noCommit?: boolean;
}

export function runCherryPickWorkflow({
  logger,
  options,
}: {
  logger: Logger;
  options: CherryPickOptions;
}): void {
  const git = createGitClient();

  const currentBranch = git.runOrThrow(['branch', '--show-current']).trim();
  if (!currentBranch) throw new GitControlsError('Detached HEAD — checkout a branch first.');

  const isRange = options.rangeTo != null && options.rangeTo.trim() !== '';

  const args: string[] = ['cherry-pick'];
  if (options.noCommit === true) args.push('--no-commit');

  if (isRange) {
    // `from..to` syntax picks all commits after `from` up to and including `to`
    // Use `from^..to` to include the `from` commit itself
    const rangeTo = options.rangeTo ?? '';
    const from = git.runOrThrow(['rev-parse', '--short', options.commit]).trim();
    const to = git.runOrThrow(['rev-parse', '--short', rangeTo]).trim();
    logger.info(`Cherry-picking range ${from}..${to} onto '${currentBranch}'...`);
    args.push(`${options.commit}^..${rangeTo}`);
  } else {
    const shortHash = git.runOrThrow(['rev-parse', '--short', options.commit]).trim();
    const subject = git.runOrThrow(['log', '--format=%s', '-1', options.commit]).trim();
    logger.info(`Cherry-picking ${shortHash} ("${subject}") onto '${currentBranch}'...`);
    args.push(options.commit);
  }

  const result = git.run(args, { stdio: 'inherit' });
  if (!result.ok) {
    throw new GitControlsError('Cherry-pick failed — conflict detected.', [
      'Resolve conflicts, then run: git cherry-pick --continue',
      'Or abort with:             git cherry-pick --abort',
    ]);
  }

  if (options.noCommit === true) {
    logger.ok('Changes applied and staged. Review with git diff --cached, then commit.');
  } else {
    logger.ok(`Cherry-pick complete on '${currentBranch}'.`);
  }
}
