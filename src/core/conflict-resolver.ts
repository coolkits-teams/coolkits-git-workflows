import type { Config, GitClient } from '../types.js';
import { normalizePathList, normalizeRepoPath } from '../utils/common-pathspec.js';
import { listConflictStatus } from './feature-scope.js';

/** Files grouped by how the auto-resolver handled them. */
export interface ConflictResolutionSummary {
  /** Files under featurePath → resolved by keeping UAT's version. */
  keptUat: string[];
  /** Files outside featurePath (common/shared) → resolved by keeping root's version. */
  keptRoot: string[];
  /** DD/DU files removed. */
  removed: string[];
}

/**
 * True when `file` lives under one of the configured feature path roots.
 * Anything else (shared/, utils/, hooks/, config/ …) is "common".
 */
function isFeatureFile(file: string, config: Config): boolean {
  const path = normalizeRepoPath(file);
  return normalizePathList(config.featurePath).some(
    (root) => path === root || path.startsWith(`${root}/`),
  );
}

/**
 * Auto-resolve every conflict after a `uat → root` merge.
 *
 * Convention: merge is run on a branch checked out from root, merging UAT in.
 *   HEAD  = root (ours)
 *   MERGE_HEAD = UAT (theirs)
 *
 * Resolution rule:
 *   - Feature file  (under featurePath)  → take UAT  (latest feature code lives here)
 *   - Common file   (outside featurePath) → take root (hotfixes / shared improvements)
 *   - Both deleted                         → remove
 *
 * Nothing is committed — the caller reviews + runs tsc, then commits.
 */
export function autoResolveUatToRoot({
  git,
  config,
}: {
  git: GitClient;
  config: Config;
}): ConflictResolutionSummary {
  const summary: ConflictResolutionSummary = { keptUat: [], keptRoot: [], removed: [] };

  listConflictStatus(git).forEach((code, file) => {
    // Both deleted — no content to choose.
    if (code === 'DD' || code === 'DU') {
      git.runOrThrow(['rm', '-f', '--', file]);
      summary.removed.push(file);
      return;
    }

    if (isFeatureFile(file, config)) {
      // Feature file: UAT carries the latest version (released features).
      // UA = only UAT has the file (root doesn't) → naturally keep UAT.
      // UD = UAT deleted it, root kept it → respect UAT deletion.
      if (code === 'UD') {
        git.runOrThrow(['rm', '-f', '--', file]);
        summary.removed.push(file);
      } else {
        git.runOrThrow(['checkout', 'MERGE_HEAD', '--', file]);
        git.runOrThrow(['add', '--', file]);
        summary.keptUat.push(file);
      }
    } else {
      // Common/shared file: root carries the latest version (hotfixes, shared libs).
      // DU = root deleted it, UAT modified it → respect root deletion.
      if (code === 'DU') {
        git.runOrThrow(['rm', '-f', '--', file]);
        summary.removed.push(file);
      } else {
        git.runOrThrow(['checkout', 'HEAD', '--', file]);
        git.runOrThrow(['add', '--', file]);
        summary.keptRoot.push(file);
      }
    }
  });

  return summary;
}

/** Absolute path of the repository root (for reading/writing conflicted files). */
export function getRepoRoot(git: GitClient): string {
  return git.runOrThrow(['rev-parse', '--show-toplevel']).trim();
}
