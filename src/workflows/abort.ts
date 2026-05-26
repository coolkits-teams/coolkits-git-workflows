import { createGitClient } from '../core/git-client.js';
import { GitControlsError } from '../errors.js';
import type { Logger } from '../types.js';

type ConflictState = 'merge' | 'rebase' | 'cherry-pick' | 'revert' | 'bisect';

function detectConflictState(git: ReturnType<typeof createGitClient>): ConflictState | null {
  if (git.run(['rev-parse', '--verify', 'MERGE_HEAD']).ok) return 'merge';

  const gitDir = git.runOrThrow(['rev-parse', '--git-dir']).trim();
  if (
    git.run(['rev-parse', '--verify', `${gitDir}/rebase-merge/head-name`]).ok ||
    git.run(['rev-parse', '--verify', `${gitDir}/rebase-apply/head-name`]).ok
  )
    return 'rebase';
  // Simpler rebase detection via git status
  const statusOut = git.run(['status']).stdout;
  if (statusOut.includes('rebase in progress')) return 'rebase';

  if (git.run(['rev-parse', '--verify', 'CHERRY_PICK_HEAD']).ok) return 'cherry-pick';
  if (git.run(['rev-parse', '--verify', 'REVERT_HEAD']).ok) return 'revert';

  // Bisect: check for BISECT_LOG file via git status output
  if (statusOut.includes('bisect')) return 'bisect';

  return null;
}

export function runAbortWorkflow({ logger }: { logger: Logger }): void {
  const git = createGitClient();
  const state = detectConflictState(git);

  if (!state) {
    throw new GitControlsError(
      'No ongoing merge, rebase, cherry-pick, revert, or bisect detected.',
      [
        'If you are in a conflict state, check: git status',
        'Then abort manually with the appropriate command.',
      ],
    );
  }

  logger.info(`Detected in-progress: ${state}. Aborting...`);

  const abortCommands: Record<ConflictState, string[]> = {
    merge: ['merge', '--abort'],
    rebase: ['rebase', '--abort'],
    'cherry-pick': ['cherry-pick', '--abort'],
    revert: ['revert', '--abort'],
    bisect: ['bisect', 'reset'],
  };

  git.runOrThrow(abortCommands[state], { stdio: 'inherit' });
  logger.ok(`${state} aborted — working tree restored to pre-${state} state.`);
}
