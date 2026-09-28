import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { GitClient } from '../types.js';

const PATCH_BUFFER = 64 * 1024 * 1024;

export interface UnreleasedCommit {
  hash: string;
  short: string;
  date: string;
  name: string;
  email: string;
  subject: string;
}

export function sortCommitsChronologically(commits: UnreleasedCommit[]): UnreleasedCommit[] {
  return [...commits].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return a.hash.localeCompare(b.hash);
  });
}

export function changedFilesForCommit(hash: string, repoDir: string): string[] {
  const result = spawnSync('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', hash], {
    cwd: repoDir,
    encoding: 'utf8',
    maxBuffer: PATCH_BUFFER,
  });
  if (result.status !== 0) return [];
  return result.stdout.trim().split('\n').filter(Boolean);
}

function showPatchBuffer(hash: string, repoDir: string, paths?: string[]): Buffer | null {
  const args = ['show', hash, '--format=', '--patch'];
  if (paths != null && paths.length > 0) {
    args.push('--', ...paths);
  }

  const result = spawnSync('git', args, {
    cwd: repoDir,
    maxBuffer: PATCH_BUFFER,
  });
  if (result.status !== 0 || result.stdout.length === 0) return null;
  return result.stdout;
}

export function resetWorktreeToHead(worktreeDir: string): void {
  spawnSync('git', ['reset', '--hard', 'HEAD'], { cwd: worktreeDir, stdio: 'ignore' });
  spawnSync('git', ['clean', '-fd'], { cwd: worktreeDir, stdio: 'ignore' });
}

function applyPatchToWorktree(
  worktreeDir: string,
  hash: string,
  repoDir: string,
  paths: string[],
): boolean {
  if (paths.length === 0) return true;

  const patch = showPatchBuffer(hash, repoDir, paths);
  if (!patch) return true;

  const result = spawnSync('git', ['apply', '--3way'], {
    cwd: worktreeDir,
    input: patch,
    maxBuffer: PATCH_BUFFER,
    stdio: ['pipe', 'ignore', 'ignore'],
  });
  return result.status === 0;
}

export function isPatchAlreadyInTargetTree(
  worktreeDir: string,
  hash: string,
  repoDir: string,
): boolean {
  const patch = showPatchBuffer(hash, repoDir);
  if (!patch) return false;

  const result = spawnSync('git', ['apply', '--reverse', '--check'], {
    cwd: worktreeDir,
    input: patch,
    maxBuffer: PATCH_BUFFER,
    stdio: ['pipe', 'ignore', 'ignore'],
  });
  return result.status === 0;
}

function sharedChangedFiles(
  alreadyHash: string,
  unreleasedHashes: string[],
  repoDir: string,
): string[] {
  const alreadyFiles = new Set(changedFilesForCommit(alreadyHash, repoDir));
  const shared = new Set<string>();

  for (const unreleasedHash of unreleasedHashes) {
    for (const file of changedFilesForCommit(unreleasedHash, repoDir)) {
      if (alreadyFiles.has(file)) shared.add(file);
    }
  }

  return [...shared];
}

/**
 * A commit can look "already on target" in isolation while still becoming
 * required after earlier unreleased commits are cherry-picked (e.g. a follow-up
 * fix that undoes a debug change bundled in another commit).
 */
export function isAlreadyCommitInvalidatedByUnreleased(
  alreadyCommit: UnreleasedCommit,
  unreleasedCommits: UnreleasedCommit[],
  worktreeDir: string,
  repoDir: string,
): boolean {
  if (unreleasedCommits.length === 0) return false;

  const unreleasedHashes = unreleasedCommits.map((commit) => commit.hash);
  const sharedPaths = sharedChangedFiles(alreadyCommit.hash, unreleasedHashes, repoDir);
  if (sharedPaths.length === 0) return false;

  resetWorktreeToHead(worktreeDir);

  for (const unreleasedCommit of sortCommitsChronologically(unreleasedCommits)) {
    const paths = changedFilesForCommit(unreleasedCommit.hash, repoDir).filter((file) =>
      sharedPaths.includes(file),
    );
    applyPatchToWorktree(worktreeDir, unreleasedCommit.hash, repoDir, paths);
  }

  return !isPatchAlreadyInTargetTree(worktreeDir, alreadyCommit.hash, repoDir);
}

export function promoteDependentAlreadyCommits({
  already,
  unreleased,
  worktreeDir,
  repoDir,
}: {
  already: UnreleasedCommit[];
  unreleased: UnreleasedCommit[];
  worktreeDir: string;
  repoDir: string;
}): {
  stillAlready: UnreleasedCommit[];
  promoted: UnreleasedCommit[];
} {
  if (already.length === 0 || unreleased.length === 0) {
    return { stillAlready: already, promoted: [] };
  }

  const promoted: UnreleasedCommit[] = [];
  const stillAlready: UnreleasedCommit[] = [];

  for (const commit of already) {
    if (isAlreadyCommitInvalidatedByUnreleased(commit, unreleased, worktreeDir, repoDir)) {
      promoted.push(commit);
    } else {
      stillAlready.push(commit);
    }
  }

  return { stillAlready, promoted };
}

export function mergeUnreleasedCommits(
  unreleased: UnreleasedCommit[],
  promoted: UnreleasedCommit[],
): UnreleasedCommit[] {
  const seen = new Set<string>();
  const merged: UnreleasedCommit[] = [];

  for (const commit of sortCommitsChronologically([...unreleased, ...promoted])) {
    if (seen.has(commit.hash)) continue;
    seen.add(commit.hash);
    merged.push(commit);
  }

  return merged;
}

export type SkipReason = 'already' | 'empty' | 'ported' | 'ambiguous';

export interface SkippedCommit {
  commit: UnreleasedCommit;
  reason: SkipReason;
  targetHash?: string;
  targetHashes?: string[];
}

export interface UnreleasedClassification {
  unreleased: UnreleasedCommit[];
  promoted: UnreleasedCommit[];
  skipped: SkippedCommit[];
  counts: {
    already: number;
    empty: number;
    ported: number;
    ambiguous: number;
    unreleased: number;
    promoted: number;
  };
}

export function listCommits(
  git: GitClient,
  source: string,
  target: string,
  author: string | null,
): UnreleasedCommit[] {
  const args = [
    'log',
    `${target}..${source}`,
    '--no-merges',
    '--abbrev=8',
    '--format=%H%x00%h%x00%ad%x00%an%x00%ae%x00%s',
    '--date=short',
  ];

  if (author != null && author.trim() !== '') {
    args.push(`--author=${author.trim()}`);
  }

  const out = git.run(args).stdout.trim();
  if (!out) return [];

  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, short, date, name, email, subject] = line.split('\0');
      return {
        hash: hash ?? '',
        short: short ?? '',
        date: date ?? '',
        name: name ?? '',
        email: email ?? '',
        subject: subject ?? '',
      };
    });
}

function patchIdForCommit(hash: string, repoDir: string): string | null {
  const patch = showPatchBuffer(hash, repoDir);
  if (!patch) return null;

  const result = spawnSync('git', ['patch-id', '--stable'], {
    encoding: 'utf8',
    input: patch,
    maxBuffer: PATCH_BUFFER,
  });
  if (result.status !== 0) return null;
  return result.stdout.trim().split(/\s+/)[0] ?? null;
}

function buildTargetIndexes(
  git: GitClient,
  target: string,
): {
  bySubject: Map<string, string[]>;
  recentHashes: string[];
} {
  const out = git.run(['log', target, '--no-merges', '--format=%H%x00%s']).stdout.trim();
  const bySubject = new Map<string, string[]>();
  const recentHashes: string[] = [];
  if (!out) return { bySubject, recentHashes };

  for (const line of out.split('\n')) {
    const [hash, subject] = line.split('\0');
    if (!hash || subject === undefined) continue;
    recentHashes.push(hash);
    const list = bySubject.get(subject);
    if (list) list.push(hash);
    else bySubject.set(subject, [hash]);
  }
  return { bySubject, recentHashes };
}

function classifyByPatchId(
  commits: UnreleasedCommit[],
  bySubject: Map<string, string[]>,
  recentHashes: string[],
  repoDir: string,
): { empty: string[]; matched: Set<string>; unresolved: string[] } {
  const empty: string[] = [];
  const matched = new Set<string>();
  const pendingByPatchId = new Map<string, string>();

  for (const commit of commits) {
    const patchId = patchIdForCommit(commit.hash, repoDir);
    if (!patchId) {
      empty.push(commit.hash);
      continue;
    }

    const sameMessage = bySubject.get(commit.subject) ?? [];
    let found = false;
    for (const other of sameMessage) {
      const otherId = patchIdForCommit(other, repoDir);
      if (otherId && otherId === patchId) {
        matched.add(commit.hash);
        found = true;
        break;
      }
    }
    if (!found) pendingByPatchId.set(patchId, commit.hash);
  }

  if (pendingByPatchId.size === 0) {
    return { empty, matched, unresolved: [] };
  }

  const windowSize = Math.min(1200, recentHashes.length);
  for (let i = 0; i < windowSize; i += 1) {
    const hash = recentHashes[i];
    if (!hash) continue;
    const otherId = patchIdForCommit(hash, repoDir);
    if (!otherId) continue;
    const commitHash = pendingByPatchId.get(otherId);
    if (!commitHash) continue;
    matched.add(commitHash);
    pendingByPatchId.delete(otherId);
    if (pendingByPatchId.size === 0) break;
  }

  return {
    empty,
    matched,
    unresolved: [...pendingByPatchId.values()],
  };
}

function classifyByTitle(
  commits: UnreleasedCommit[],
  bySubject: Map<string, string[]>,
): {
  ported: { commit: UnreleasedCommit; targetHash: string }[];
  ambiguous: { commit: UnreleasedCommit; targetHashes: string[] }[];
  missing: UnreleasedCommit[];
} {
  const ported: { commit: UnreleasedCommit; targetHash: string }[] = [];
  const ambiguous: { commit: UnreleasedCommit; targetHashes: string[] }[] = [];
  const missing: UnreleasedCommit[] = [];

  for (const commit of commits) {
    const matches = bySubject.get(commit.subject) ?? [];
    if (matches.length === 1) {
      ported.push({ commit, targetHash: matches[0] ?? '' });
    } else if (matches.length > 1) {
      ambiguous.push({ commit, targetHashes: matches });
    } else {
      missing.push(commit);
    }
  }

  return { ported, ambiguous, missing };
}

function createTargetWorktree(git: GitClient, target: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'git-unreleased-'));
  git.runOrThrow(['worktree', 'add', '--detach', '--quiet', dir, target]);
  return dir;
}

function removeTargetWorktree(git: GitClient, dir: string): void {
  try {
    git.run(['worktree', 'remove', '--force', dir]);
  } catch {
    try {
      rmSync(dir, { recursive: true, force: true });
      git.run(['worktree', 'prune']);
    } catch {
      // ignore cleanup errors
    }
  }
}

/**
 * Classify source..target commits without logging.
 *
 * Skip reasons:
 * - already: reverse-applying the commit patch on the target tree succeeds.
 * - empty: commit has no diff.
 * - ported: exactly one target commit shares the same subject.
 * - ambiguous: multiple target commits share the same subject.
 *
 * Promotion (already → unreleased) only when simulating unreleased picks on
 * shared files makes an already commit's patch no longer reverse-applicable.
 */
export function classifyUnreleasedCommits({
  git,
  // source,
  target,
  commits,
}: {
  git: GitClient;
  source: string;
  target: string;
  commits: UnreleasedCommit[];
}): UnreleasedClassification {
  const repoRoot = git.runOrThrow(['rev-parse', '--show-toplevel']).trim();
  const byHash = new Map(commits.map((commit) => [commit.hash, commit]));

  const { bySubject, recentHashes } = buildTargetIndexes(git, target);
  const {
    empty: emptyHashes,
    matched: matchedHashes,
    unresolved: unresolvedHashes,
  } = classifyByPatchId(commits, bySubject, recentHashes, repoRoot);

  const already = [...matchedHashes]
    .map((hash) => byHash.get(hash))
    .filter(Boolean) as UnreleasedCommit[];
  const empty = emptyHashes.map((hash) => byHash.get(hash)).filter(Boolean) as UnreleasedCommit[];
  let unresolved = unresolvedHashes
    .map((hash) => byHash.get(hash))
    .filter(Boolean) as UnreleasedCommit[];

  let worktreeDir: string | null = null;
  let ported: { commit: UnreleasedCommit; targetHash: string }[] = [];
  let ambiguous: { commit: UnreleasedCommit; targetHashes: string[] }[] = [];
  let unreleased: UnreleasedCommit[] = [];
  let promoted: UnreleasedCommit[] = [];

  try {
    if (unresolved.length > 0) {
      worktreeDir = createTargetWorktree(git, target);

      const stillMissing: UnreleasedCommit[] = [];
      for (const commit of unresolved) {
        if (isPatchAlreadyInTargetTree(worktreeDir, commit.hash, repoRoot)) {
          already.push(commit);
        } else {
          stillMissing.push(commit);
        }
      }
      unresolved = stillMissing;
    }

    ({ ported, ambiguous, missing: unreleased } = classifyByTitle(unresolved, bySubject));

    if (already.length > 0 && unreleased.length > 0) {
      worktreeDir ??= createTargetWorktree(git, target);

      const { stillAlready, promoted: promotedFixes } = promoteDependentAlreadyCommits({
        already,
        unreleased,
        worktreeDir,
        repoDir: repoRoot,
      });

      promoted = promotedFixes;
      already.length = 0;
      already.push(...stillAlready);
      unreleased = mergeUnreleasedCommits(unreleased, promoted);
    }
  } finally {
    if (worktreeDir) removeTargetWorktree(git, worktreeDir);
  }

  const skipped: SkippedCommit[] = [
    ...already.map((commit) => ({ commit, reason: 'already' as const })),
    ...empty.map((commit) => ({ commit, reason: 'empty' as const })),
    ...ported.map((row) => ({
      commit: row.commit,
      reason: 'ported' as const,
      targetHash: row.targetHash,
    })),
    ...ambiguous.map((row) => ({
      commit: row.commit,
      reason: 'ambiguous' as const,
      targetHashes: row.targetHashes,
    })),
  ];

  return {
    unreleased,
    promoted,
    skipped,
    counts: {
      already: already.length,
      empty: empty.length,
      ported: ported.length,
      ambiguous: ambiguous.length,
      unreleased: unreleased.length,
      promoted: promoted.length,
    },
  };
}
