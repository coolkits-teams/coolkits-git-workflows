import { GitControlsError } from '../errors.js';
import type { GitClient, WorkingTreeInspector } from '../types.js';

export function createWorkingTreeInspector({ git }: { git: GitClient }): WorkingTreeInspector {
  const isGitRepository = (): boolean => git.run(['rev-parse', '--is-inside-work-tree']).ok;

  /**
   * Returns porcelain lines for tracked files that are dirty.
   * Untracked files (lines starting with `??`) are intentionally excluded.
   */
  const listDirtyTrackedFiles = (): string[] =>
    git
      .run(['status', '--porcelain=v1'])
      .stdout.split('\n')
      .filter((line) => line.length > 0 && !line.startsWith('??'));

  const assertClean = (): void => {
    const dirty = listDirtyTrackedFiles();
    if (dirty.length === 0) return;

    throw new GitControlsError(
      'Working tree is not clean. Commit or stash tracked changes first.',
      dirty,
    );
  };

  return { isGitRepository, listDirtyTrackedFiles, assertClean };
}
