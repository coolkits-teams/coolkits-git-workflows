import { createGitClient } from '../core/git-client.js';
import { GitControlsError } from '../errors.js';
import type { Logger } from '../types.js';

export type BisectAction = 'start' | 'good' | 'bad' | 'reset';

export interface BisectOptions {
  action: BisectAction;
  /** Last known good commit (required for action=start). */
  good?: string | null;
  /** Known bad commit — defaults to HEAD (used for action=start). */
  bad?: string | null;
}

export function runBisectWorkflow({
  logger,
  options,
}: {
  logger: Logger;
  options: BisectOptions;
}): void {
  const git = createGitClient();

  switch (options.action) {
    case 'start': {
      if (!options.good) {
        throw new GitControlsError('--good <commit> is required to start bisect.');
      }

      const badRef = options.bad ?? 'HEAD';
      const badShort = git.runOrThrow(['rev-parse', '--short', badRef]).trim();
      const goodShort = git.runOrThrow(['rev-parse', '--short', options.good]).trim();

      logger.info(`Starting bisect: good=${goodShort}, bad=${badShort}`);

      git.runOrThrow(['bisect', 'start']);
      git.runOrThrow(['bisect', 'bad', badRef], { stdio: 'inherit' });
      git.runOrThrow(['bisect', 'good', options.good], { stdio: 'inherit' });

      logger.ok('Bisect started. Git has checked out a commit to test.');
      logger.plain('');
      printBisectInstructions(logger);
      break;
    }

    case 'good': {
      logger.info('Marking current commit as GOOD...');
      const result = git.run(['bisect', 'good'], { stdio: 'inherit' });
      if (!result.ok) throw new GitControlsError('Not in a bisect session. Run: git-bisect start');
      checkBisectDone(logger, result.stdout);
      break;
    }

    case 'bad': {
      logger.info('Marking current commit as BAD...');
      const result = git.run(['bisect', 'bad'], { stdio: 'inherit' });
      if (!result.ok) throw new GitControlsError('Not in a bisect session. Run: git-bisect start');
      checkBisectDone(logger, result.stdout);
      break;
    }

    case 'reset': {
      logger.info('Resetting bisect and returning to original branch...');
      git.runOrThrow(['bisect', 'reset'], { stdio: 'inherit' });
      logger.ok('Bisect reset. You are back on your original branch.');
      break;
    }
  }
}

function checkBisectDone(logger: Logger, output: string): void {
  if (output.includes('is the first bad commit')) {
    logger.ok('🎯 Found the first bad commit! See output above.');
    logger.plain('');
    logger.plain('Next steps:');
    logger.plain('  1. Note the commit hash shown above.');
    logger.plain('  2. Reset bisect: git-bisect reset');
    logger.plain('  3. Investigate: git show <commit-hash>');
  } else {
    printBisectInstructions(logger);
  }
}

function printBisectInstructions(logger: Logger): void {
  logger.plain('Test the current state, then mark the commit:');
  logger.plain('  git-bisect good   ← if this commit does NOT have the bug');
  logger.plain('  git-bisect bad    ← if this commit HAS the bug');
  logger.plain('  git-bisect reset  ← to abort and go back to your branch');
}
