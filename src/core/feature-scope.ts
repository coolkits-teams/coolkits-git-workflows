import type { Config, GitClient } from '../types.js';
import { normalizePathList, normalizeRepoPath } from '../utils/common-pathspec.js';

/** How a conflicted file relates to the feature branch being synced. */
export type ConflictOwnership = 'mine' | 'other' | 'shared';

/**
 * Feature directories the branch genuinely owns.
 *
 * Derived from the branch's OWN work only: first-parent, non-merge commits since
 * the merge-base with root. This excludes code that arrived via earlier `main`/`root`
 * merges, so a file like `src/features/other-feature/x.ts` that only came along with a
 * sync is NOT mistaken for the branch's own feature.
 *
 * @example
 * detectOwnedFeatureDirs({ git, config, baseRef, branchRef: 'HEAD' })
 * // → ['src/features/payment']
 */
export function detectOwnedFeatureDirs({
  git,
  config,
  baseRef,
  branchRef,
}: {
  git: GitClient;
  config: Config;
  baseRef: string;
  branchRef: string;
}): string[] {
  const featureRoots = normalizePathList(config.featurePath);
  if (featureRoots.length === 0) return [];

  const owned = new Set<string>();

  for (const root of featureRoots) {
    const result = git.run([
      'log',
      '--no-merges',
      '--first-parent',
      `${baseRef}..${branchRef}`,
      '--name-only',
      '--pretty=format:',
      '--',
      `${root}/*`,
    ]);
    if (!result.ok) continue;

    result.stdout
      .split('\n')
      .map((line) => normalizeRepoPath(line.trim()))
      .filter(Boolean)
      .forEach((file) => {
        const rest = file.slice(root.length + 1);
        const name = rest.split('/')[0];
        if (name) owned.add(`${root}/${name}`);
      });
  }

  return [...owned].sort();
}

/**
 * Classify a conflicted file relative to the owned feature dirs.
 * - 'mine':   inside a feature dir this branch owns → dev resolves manually.
 * - 'other':  inside featurePath but a different feature → safe to keep root.
 * - 'shared': outside featurePath (shared/common, config) → dev resolves manually.
 */
export function classifyConflictFile(
  file: string,
  ownedDirs: string[],
  config: Config,
): ConflictOwnership {
  const path = normalizeRepoPath(file);

  const isUnder = (dir: string): boolean => path === dir || path.startsWith(`${dir}/`);

  if (ownedDirs.some(isUnder)) return 'mine';

  const featureRoots = normalizePathList(config.featurePath);
  if (featureRoots.some(isUnder)) return 'other';

  return 'shared';
}

/** Git porcelain status codes that mark an unmerged (conflicted) path. */
const CONFLICT_CODES = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']);

/** Map each unmerged path to its porcelain status code (rename dest kept). */
export function listConflictStatus(git: GitClient): Map<string, string> {
  const porcelain = git.run(['status', '--porcelain']);
  const map = new Map<string, string>();
  if (!porcelain.ok) return map;

  porcelain.stdout
    .split('\n')
    .filter(Boolean)
    .forEach((line) => {
      const code = line.slice(0, 2);
      if (!CONFLICT_CODES.has(code)) return;

      // Path starts at column 3; rename conflicts use "orig -> dest" — keep dest.
      const raw = line.slice(3).trim();
      const path = raw.includes(' -> ') ? raw.split(' -> ')[1] : raw;
      if (path) map.set(normalizeRepoPath(path), code);
    });

  return map;
}

/** List paths currently in a conflicted (unmerged) state. */
export function listConflictedFiles(git: GitClient): string[] {
  return [...listConflictStatus(git).keys()];
}

/**
 * Find files that root added to "other" feature directories (exist in rootRef but not
 * in HEAD) and are NOT owned by this branch. These files aren't in the conflict list
 * (no conflict marker) but need to be explicitly staged so auto-resolved files that
 * import them don't produce "module not found" errors.
 */
export function listNewFilesInOtherDirs({
  git,
  config,
  ownedDirs,
  rootRef,
}: {
  git: GitClient;
  config: Config;
  ownedDirs: string[];
  rootRef: string;
}): string[] {
  const featureRoots = normalizePathList(config.featurePath);
  if (featureRoots.length === 0) return [];

  const result = git.run([
    'diff',
    '--diff-filter=A',
    '--name-only',
    'HEAD',
    rootRef,
    '--',
    ...featureRoots,
  ]);
  if (!result.ok) return [];

  return result.stdout
    .split('\n')
    .map((line) => normalizeRepoPath(line.trim()))
    .filter(Boolean)
    .filter((file) => {
      const ownership = classifyConflictFile(file, ownedDirs, config);
      return ownership === 'other';
    });
}

/**
 * True when the feature branch (HEAD) has commit(s) touching `file` that `rootRef` does
 * NOT contain — i.e. root is *behind* for this file. Taking root wholesale would discard
 * that work, so the caller should defer to manual resolution instead.
 *
 * This catches the case where another feature was released to UAT but not yet synced
 * back to root (root→feature would otherwise overwrite the newer code with stale root).
 */
export function isFeatureAheadOfRootForFile({
  git,
  file,
  rootRef,
}: {
  git: GitClient;
  file: string;
  rootRef: string;
}): boolean {
  const result = git.run(['rev-list', '--count', `${rootRef}..HEAD`, '--', file]);
  if (!result.ok) return false;
  return Number(result.stdout.trim()) > 0;
}

/**
 * Resolve a conflicted file by taking root's version (here root = `rootRef`,
 * the "theirs" side of a root→feature merge).
 *
 * Uses the tree object directly instead of `git checkout --theirs`, which fails on
 * rename/add conflicts ("path does not have their version"). If root doesn't have the
 * path (it deleted the file), the deletion is kept.
 */
export function takeRootVersion({
  git,
  file,
  rootRef,
}: {
  git: GitClient;
  file: string;
  rootRef: string;
}): void {
  const existsInRoot = git.run(['cat-file', '-e', `${rootRef}:${file}`]).ok;

  if (existsInRoot) {
    git.runOrThrow(['checkout', rootRef, '--', file]);
    git.runOrThrow(['add', '--', file]);
  } else {
    git.runOrThrow(['rm', '-f', '--', file]);
  }
}

/**
 * Resolve a conflicted file by keeping the current branch's version (HEAD).
 * Used for files that belong to the dev's own feature — their local code takes priority.
 * If HEAD doesn't have the file (dev deleted it), the deletion is kept.
 */
export function takeMineVersion({ git, file }: { git: GitClient; file: string }): void {
  const existsInHead = git.run(['cat-file', '-e', `HEAD:${file}`]).ok;

  if (existsInHead) {
    git.runOrThrow(['checkout', 'HEAD', '--', file]);
    git.runOrThrow(['add', '--', file]);
  } else {
    git.runOrThrow(['rm', '-f', '--', file]);
  }
}
