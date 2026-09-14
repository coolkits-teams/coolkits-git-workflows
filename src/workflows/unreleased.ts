import { createGitClient } from '../core/git-client.js';
import { GitControlsError } from '../errors.js';
import type { Config, GitClient, Logger } from '../types.js';
import {
  type UnreleasedCommit,
  classifyUnreleasedCommits,
  listCommits,
} from './unreleased-dependency.js';

export { listCommits } from './unreleased-dependency.js';

export interface UnreleasedOptions {
  /** Branch/ref that may have new commits. Default: current branch. */
  source?: string | null;
  /** Branch/ref already released to. Default: preUatBranch or uatBranch from config. */
  target?: string | null;
  /** Filter by author email (substring match). Default: git user.email. */
  author?: string | null;
  /** Do not filter by author — include all authors. */
  allAuthors?: boolean;
  /** Skip equivalence checks; list commits in target..source by hash only. */
  fast?: boolean;
  /**
   * Also list noisy commits (already on target, empty, ported, ambiguous)
   * with warnings. Default: only unreleased commits are listed.
   */
  careful?: boolean;
  /** Skip fetching source/target from remote before comparing. */
  noFetch?: boolean;
}

export type { UnreleasedCommit } from './unreleased-dependency.js';

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

function resolveCurrentBranch(git: GitClient): string {
  const branch = git.runOrThrow(['branch', '--show-current']).trim();
  if (!branch) {
    throw new GitControlsError('Detached HEAD — checkout a branch first.');
  }
  return branch;
}

function resolveGitUserEmail(git: GitClient): string {
  const email = git.run(['config', 'user.email']).stdout.trim();
  if (!email) {
    throw new GitControlsError('Git user.email is not configured.', [
      'Set it with: git config user.email you@example.com',
      'Or pass --author explicitly, or use --all-authors.',
    ]);
  }
  return email;
}

function resolveAuthorFilter(git: GitClient, options: UnreleasedOptions): string | null {
  if (options.allAuthors === true) return null;
  if (options.author != null && options.author.trim() !== '') {
    return options.author.trim();
  }
  return resolveGitUserEmail(git);
}

/** Resolve a branch name or ref to `{remote}/{branch}` for remote-first comparison. */
function resolveRemoteRef(git: GitClient, config: Config, ref: string): string {
  const trimmed = ref.trim();
  if (trimmed.startsWith(`${config.remote}/`)) return trimmed;
  if (/^[0-9a-f]{7,40}$/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('refs/')) return trimmed;

  const slash = trimmed.indexOf('/');
  if (slash > 0) {
    const maybeRemote = trimmed.slice(0, slash);
    const remotes = git
      .run(['remote'])
      .stdout.split('\n')
      .map((r) => r.trim())
      .filter(Boolean);
    if (remotes.includes(maybeRemote)) return trimmed;
  }

  return `${config.remote}/${trimmed}`;
}

/** Branch name to pass to `git fetch <remote> <branch>`. */
function branchNameForFetch(config: Config, resolvedRef: string): string | null {
  const prefix = `${config.remote}/`;
  if (!resolvedRef.startsWith(prefix)) return null;
  const branch = resolvedRef.slice(prefix.length);
  return branch !== '' ? branch : null;
}

function fetchRemoteRefs(
  git: GitClient,
  config: Config,
  logger: Logger,
  resolvedRefs: string[],
): void {
  const branches = [
    ...new Set(
      resolvedRefs
        .map((ref) => branchNameForFetch(config, ref))
        .filter((b): b is string => b != null && b !== ''),
    ),
  ];

  if (branches.length === 0) return;

  logger.info(`Fetching ${config.remote}: ${branches.join(', ')}...`);
  git.runOrThrow(['fetch', config.remote, ...branches], { stdio: 'inherit' });
}

function ensureRef(git: GitClient, ref: string, config: Config): void {
  if (!git.run(['rev-parse', '--verify', `${ref}^{commit}`]).ok) {
    throw new GitControlsError(`Ref not found: ${ref}`, [
      `Run: git fetch ${config.remote} <branch>`,
      `Or re-run without --no-fetch so coolkit fetches before comparing.`,
    ]);
  }
}

function shortHash(hash: string): string {
  return hash.slice(0, 8);
}

function formatCommitLine(commit: UnreleasedCommit, note?: string): string {
  const base = `${commit.short} ${commit.date} ${commit.email} | ${commit.subject}`;
  return note ? `${base}  ${note}` : base;
}

const PROMOTED_FIX_NOTE =
  '[required after other unreleased commit(s) — pick together, do not skip]';

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

  const sourceInput = options.source?.trim() ?? resolveCurrentBranch(git);
  const targetInput = options.target?.trim() ?? resolveDefaultTarget(config);
  const source = resolveRemoteRef(git, config, sourceInput);
  const target = resolveRemoteRef(git, config, targetInput);
  const author = resolveAuthorFilter(git, options);
  const showNoise = options.careful === true;

  if (options.noFetch !== true) {
    fetchRemoteRefs(git, config, logger, [source, target]);
  } else {
    logger.warn('--no-fetch: using local remote-tracking refs without fetching.');
  }

  ensureRef(git, source, config);
  ensureRef(git, target, config);

  const commits = listCommits(git, source, target, author);

  const authorLabel = author ? ` (author~${author})` : ' (all authors)';
  const modeLabel = options.fast === true ? ' [fast/hash-only]' : ' [patch + tree + title]';
  const filterLabel = showNoise ? '' : ' [unreleased only — use --careful for warnings]';

  logger.plain(
    `Comparing commits on ${source} not in ${target}${authorLabel}${modeLabel}${filterLabel}`,
  );
  logger.plain(`Refs resolved from ${config.remote} (fetched before compare unless --no-fetch).`);
  logger.plain(
    `Candidates by hash (${target}..${source}, no merges): ${commits.length.toString()}`,
  );

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
  logger.plain(`Checking remaining commit(s) against ${target} tree...`);

  const classification = classifyUnreleasedCommits({ git, source, target, commits });
  const { unreleased, promoted, skipped, counts } = classification;
  const promotedHashes = new Set(promoted.map((commit) => commit.hash));

  const already = skipped.filter((row) => row.reason === 'already').map((row) => row.commit);
  const empty = skipped.filter((row) => row.reason === 'empty').map((row) => row.commit);
  const ported = skipped
    .filter((row) => row.reason === 'ported')
    .map((row) => ({ commit: row.commit, targetHash: row.targetHash ?? '' }));
  const ambiguous = skipped
    .filter((row) => row.reason === 'ambiguous')
    .map((row) => ({ commit: row.commit, targetHashes: row.targetHashes ?? [] }));

  if (counts.promoted > 0) {
    logger.plain(
      `Promoted ${counts.promoted.toString()} follow-up fix(es) from already-on-target to unreleased.`,
    );
  }

  logger.plain(`Already on ${target} (same patch): ${counts.already.toString()}`);
  logger.plain(`Empty commits (no diff): ${counts.empty.toString()}`);
  logger.plain(`Ported (same title, patch differs): ${counts.ported.toString()}`);
  logger.plain(`Ambiguous titles: ${counts.ambiguous.toString()}`);
  logger.plain(`Unreleased: ${counts.unreleased.toString()}`);

  const noiseCount = counts.already + counts.empty + counts.ported + counts.ambiguous;
  if (!showNoise && noiseCount > 0) {
    logger.plain('');
    logger.plain(
      `${noiseCount.toString()} noisy commit(s) hidden. Use --careful to list them with do-not-pick warnings.`,
    );
  }

  logger.plain('');

  if (unreleased.length === 0 && !showNoise) {
    if (noiseCount > 0) {
      logger.ok('Nothing to cherry-pick — all candidates are already on target or unsafe to pick.');
    } else {
      logger.ok('Nothing unreleased.');
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
      unreleased: 0,
    };
  }

  if (unreleased.length === 0 && ported.length === 0 && ambiguous.length === 0 && showNoise) {
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

  if (showNoise) {
    if (already.length > 0) {
      logger.warn('Already on target (same patch) — do NOT cherry-pick:');
      for (const c of already) {
        logger.plain(formatCommitLine(c, '[already on target — skip]'));
      }
      logger.plain('');
    }

    if (empty.length > 0) {
      logger.warn('Empty commits (no diff) — do NOT cherry-pick:');
      for (const c of empty) {
        logger.plain(formatCommitLine(c, '[empty commit — skip]'));
      }
      logger.plain('');
    }

    if (ported.length > 0) {
      logger.warn('Ported with conflict resolve — do NOT cherry-pick again:');
      for (const row of ported) {
        logger.plain(
          formatCommitLine(
            row.commit,
            `[ported → ${shortHash(row.targetHash)}, patch differs — do not cherry-pick again]`,
          ),
        );
      }
      logger.plain('');
    }

    if (ambiguous.length > 0) {
      logger.warn('Ambiguous title on target — verify manually before picking:');
      for (const row of ambiguous) {
        const shorts = row.targetHashes.map(shortHash).join(', ');
        logger.plain(
          formatCommitLine(
            row.commit,
            `[ambiguous: ${row.targetHashes.length.toString()} commits on target share this title (${shorts})]`,
          ),
        );
      }
      logger.plain('');
    }
  }

  if (unreleased.length > 0) {
    if (showNoise) {
      logger.ok('Safe to cherry-pick:');
    }
    for (const c of unreleased) {
      const note = promotedHashes.has(c.hash) ? PROMOTED_FIX_NOTE : undefined;
      logger.plain(formatCommitLine(c, note));
    }
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
