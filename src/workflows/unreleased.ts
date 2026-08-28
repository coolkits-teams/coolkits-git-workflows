import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createGitClient } from '../core/git-client.js';
import { GitControlsError } from '../errors.js';
import type { Config, GitClient, Logger } from '../types.js';

const PATCH_BUFFER = 64 * 1024 * 1024;

export interface UnreleasedOptions {
  /** Branch/ref that may have new commits. Default: config.qaBranch */
  source?: string | null;
  /** Branch/ref already released to. Default: config.preUatBranch or config.uatBranch */
  target?: string | null;
  /** Filter by author email (substring match). */
  author?: string | null;
  /** Skip equivalence checks; list commits in target..source by hash only. */
  fast?: boolean;
}

export interface UnreleasedCommit {
  hash: string;
  short: string;
  date: string;
  name: string;
  email: string;
  subject: string;
}

export interface UnreleasedResult {
  status: 'ok' | 'empty';
  source: string;
  target: string;
  candidates: number;
  already: number;
  empty: number;
  ported: number;
  ambiguous: number;
  unreleased: number;
}

function resolveDefaultTarget(config: Config): string {
  return config.preUatBranch.trim() !== '' ? config.preUatBranch : config.uatBranch;
}

function ensureRef(git: GitClient, ref: string): void {
  if (!git.run(['rev-parse', '--verify', `${ref}^{commit}`]).ok) {
    throw new GitControlsError(`Ref not found: ${ref}`, [
      `Tip: run \`git fetch ${ref.includes('/') ? (ref.split('/')[0] ?? 'origin') : 'origin'}\` and use origin/<branch> if local is stale.`,
    ]);
  }
}

function listCommits(
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

function showPatchBuffer(hash: string): Buffer | null {
  const result = spawnSync('git', ['show', hash, '--format=', '--patch'], {
    maxBuffer: PATCH_BUFFER,
  });
  if (result.status !== 0 || result.stdout.length === 0) return null;
  return result.stdout;
}

function patchIdForCommit(hash: string): string | null {
  const patch = showPatchBuffer(hash);
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
  logger: Logger,
): { empty: string[]; matched: Set<string>; unresolved: string[] } {
  const empty: string[] = [];
  const matched = new Set<string>();
  const pendingByPatchId = new Map<string, string>();

  for (const commit of commits) {
    const patchId = patchIdForCommit(commit.hash);
    if (!patchId) {
      empty.push(commit.hash);
      continue;
    }

    const sameMessage = bySubject.get(commit.subject) ?? [];
    let found = false;
    for (const other of sameMessage) {
      const otherId = patchIdForCommit(other);
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
  logger.plain(
    `Scanning ${windowSize.toString()} recent commits on target for ${pendingByPatchId.size.toString()} remaining patch(es)...`,
  );

  for (let i = 0; i < windowSize; i += 1) {
    const hash = recentHashes[i];
    if (!hash) continue;
    const otherId = patchIdForCommit(hash);
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

function shortHash(hash: string): string {
  return hash.slice(0, 8);
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

function formatCommitLine(commit: UnreleasedCommit, note?: string): string {
  const base = `${commit.short} ${commit.date} ${commit.email} | ${commit.subject}`;
  return note ? `${base}  ${note}` : base;
}

function isPatchAlreadyInTargetTree(worktreeDir: string, hash: string): boolean {
  const patch = showPatchBuffer(hash);
  if (!patch) return false;

  const result = spawnSync('git', ['apply', '--reverse', '--check'], {
    cwd: worktreeDir,
    input: patch,
    maxBuffer: PATCH_BUFFER,
    stdio: ['pipe', 'ignore', 'ignore'],
  });
  return result.status === 0;
}

export function runUnreleasedWorkflow({
  config,
  logger,
  options = {},
}: {
  config: Config;
  logger: Logger;
  options?: UnreleasedOptions;
}): UnreleasedResult {
  const git = createGitClient();

  const source = options.source?.trim() ?? config.qaBranch;
  const target = options.target?.trim() ?? resolveDefaultTarget(config);
  const author = options.author?.trim() ?? null;

  ensureRef(git, source);
  ensureRef(git, target);

  const commits = listCommits(git, source, target, author);

  const authorLabel = author ? ` (author~${author})` : ' (all authors)';
  const modeLabel = options.fast === true ? ' [fast/hash-only]' : ' [patch + tree + title]';

  logger.plain(`Comparing commits on ${source} not in ${target}${authorLabel}${modeLabel}`);
  logger.plain(`Candidates by hash (target..source, no merges): ${commits.length.toString()}`);

  if (commits.length === 0) {
    logger.ok('No commits to report.');
    return {
      status: 'empty',
      source,
      target,
      candidates: 0,
      already: 0,
      empty: 0,
      ported: 0,
      ambiguous: 0,
      unreleased: 0,
    };
  }

  if (options.fast === true) {
    for (const c of commits) {
      logger.plain(`${c.short} ${c.date} ${c.email} | ${c.subject}`);
    }
    return {
      status: 'ok',
      source,
      target,
      candidates: commits.length,
      already: 0,
      empty: 0,
      ported: 0,
      ambiguous: 0,
      unreleased: commits.length,
    };
  }

  logger.plain(`Building index for ${target}...`);
  const { bySubject, recentHashes } = buildTargetIndexes(git, target);
  const {
    empty: emptyHashes,
    matched: matchedHashes,
    unresolved: unresolvedHashes,
  } = classifyByPatchId(commits, bySubject, recentHashes, logger);

  const byHash = new Map(commits.map((c) => [c.hash, c]));
  const already = [...matchedHashes]
    .map((h) => byHash.get(h))
    .filter(Boolean) as UnreleasedCommit[];
  const empty = emptyHashes.map((h) => byHash.get(h)).filter(Boolean) as UnreleasedCommit[];
  let unresolved = unresolvedHashes.map((h) => byHash.get(h)).filter(Boolean) as UnreleasedCommit[];

  let worktreeDir: string | null = null;
  try {
    if (unresolved.length > 0) {
      logger.plain(
        `Checking ${unresolved.length.toString()} remaining commit(s) against ${target} tree...`,
      );
      worktreeDir = createTargetWorktree(git, target);

      const stillMissing: UnreleasedCommit[] = [];
      for (const commit of unresolved) {
        if (isPatchAlreadyInTargetTree(worktreeDir, commit.hash)) {
          already.push(commit);
        } else {
          stillMissing.push(commit);
        }
      }
      unresolved = stillMissing;
    }
  } finally {
    if (worktreeDir) removeTargetWorktree(git, worktreeDir);
  }

  const { ported, ambiguous, missing: unreleased } = classifyByTitle(unresolved, bySubject);

  logger.plain(`Already on ${target} (same patch): ${already.length.toString()}`);
  logger.plain(`Empty commits (no diff): ${empty.length.toString()}`);
  logger.plain(`Ported (same title, patch differs): ${ported.length.toString()}`);
  logger.plain(`Ambiguous titles: ${ambiguous.length.toString()}`);
  logger.plain(`Unreleased: ${unreleased.length.toString()}`);
  logger.plain('');

  if (unreleased.length === 0 && ported.length === 0 && ambiguous.length === 0) {
    logger.ok('Nothing unreleased.');
    return {
      status: 'ok',
      source,
      target,
      candidates: commits.length,
      already: already.length,
      empty: empty.length,
      ported: ported.length,
      ambiguous: ambiguous.length,
      unreleased: 0,
    };
  }

  for (const row of ported) {
    logger.plain(
      formatCommitLine(
        row.commit,
        `[ported → ${shortHash(row.targetHash)}, patch differs — do not cherry-pick again]`,
      ),
    );
  }

  for (const row of ambiguous) {
    const shorts = row.targetHashes.map(shortHash).join(', ');
    logger.plain(
      formatCommitLine(
        row.commit,
        `[ambiguous: ${row.targetHashes.length.toString()} commits on target share this title (${shorts})]`,
      ),
    );
  }

  for (const c of unreleased) {
    logger.plain(formatCommitLine(c));
  }

  return {
    status: 'ok',
    source,
    target,
    candidates: commits.length,
    already: already.length,
    empty: empty.length,
    ported: ported.length,
    ambiguous: ambiguous.length,
    unreleased: unreleased.length,
  };
}
