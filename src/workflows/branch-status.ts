import { createGitClient } from '../core/git-client.js';
import type { Config, Logger } from '../types.js';

export interface BranchStatusOptions {
  /** Show only branches matching this pattern. */
  pattern?: string | null;
  /** Skip fetch before checking status. */
  noFetch?: boolean;
}

export interface BranchInfo {
  name: string;
  isCurrent: boolean;
  ahead: number;
  behind: number;
  lastCommit: string;
  lastAuthor: string;
  remoteStatus: 'ok' | 'gone' | 'no-remote' | 'ahead' | 'diverged';
}

export interface BranchStatusResult {
  status: 'ok';
  branches: BranchInfo[];
  mainBranch: string;
}

export function runBranchStatusWorkflow({
  config,
  logger,
  options = {},
}: {
  config: Config;
  logger: Logger;
  options?: BranchStatusOptions;
}): BranchStatusResult {
  const git = createGitClient();

  if (options.noFetch !== true) {
    logger.info(`Fetching ${config.remote} --prune...`);
    git.run(['fetch', config.remote, '--prune']);
  }

  const currentBranch = git.runOrThrow(['branch', '--show-current']).trim();
  const mainRef = `${config.remote}/${config.mainBranch}`;

  // Verify remote main exists — if not, skip ahead/behind calculations
  const hasRemoteMain = git.run(['rev-parse', '--verify', mainRef]).ok;

  // Get all local branches with metadata in one call
  const SEP = '\x1F';
  const rawOutput = git
    .run([
      'for-each-ref',
      '--sort=-committerdate',
      `--format=%(refname:short)${SEP}%(committerdate:relative)${SEP}%(authorname)${SEP}%(upstream:short)${SEP}%(upstream:track)`,
      'refs/heads',
    ])
    .stdout.trim();

  if (!rawOutput) {
    logger.warn('No local branches found.');
    return { status: 'ok', branches: [], mainBranch: config.mainBranch };
  }

  const branches: BranchInfo[] = rawOutput
    .split('\n')
    .filter(Boolean)
    .filter((line) => {
      if (!options.pattern) return true;
      const name = line.split(SEP)[0] ?? '';
      return name.includes(options.pattern);
    })
    .map((line) => {
      const parts = line.split(SEP);
      const name = parts[0] ?? '';
      const lastCommit = parts[1] ?? '';
      const lastAuthor = parts[2] ?? '';
      const upstream = parts[3] ?? '';
      const track = parts[4] ?? '';

      let ahead = 0;
      let behind = 0;

      if (hasRemoteMain && name !== config.mainBranch) {
        const aheadRaw = git.run(['rev-list', '--count', `${mainRef}..${name}`]).stdout.trim();
        const behindRaw = git.run(['rev-list', '--count', `${name}..${mainRef}`]).stdout.trim();
        ahead = Number(aheadRaw) || 0;
        behind = Number(behindRaw) || 0;
      }

      let remoteStatus: BranchInfo['remoteStatus'] = 'ok';
      if (!upstream) {
        remoteStatus = 'no-remote';
      } else if (track.includes('gone')) {
        remoteStatus = 'gone';
      } else if (track.includes('ahead') && track.includes('behind')) {
        remoteStatus = 'diverged';
      } else if (track.includes('ahead')) {
        remoteStatus = 'ahead';
      }

      return {
        name,
        isCurrent: name === currentBranch,
        ahead,
        behind,
        lastCommit,
        lastAuthor,
        remoteStatus,
      };
    });

  // ── Render table ─────────────────────────────────────────────────────────────

  const maxNameLen = Math.max(...branches.map((b) => b.name.length), 22);
  const maxAuthorLen = 14;

  const remoteLabel = (b: BranchInfo): string => {
    switch (b.remoteStatus) {
      case 'gone':
        return '[gone]';
      case 'no-remote':
        return '[local only]';
      case 'ahead':
        return '[push needed]';
      case 'diverged':
        return '[diverged]';
      default:
        return '';
    }
  };

  logger.plain('');
  logger.plain(
    `  ${'Branch'.padEnd(maxNameLen)}  ${'Ahead'.padStart(5)}  ${'Behind'.padStart(6)}  ${'Last commit'.padEnd(16)}  ${'Author'.padEnd(maxAuthorLen)}  Remote`,
  );
  logger.plain(
    `  ${'─'.repeat(maxNameLen)}  ${'─'.repeat(5)}  ${'─'.repeat(6)}  ${'─'.repeat(16)}  ${'─'.repeat(maxAuthorLen)}  ──────────────`,
  );

  for (const b of branches) {
    const prefix = b.isCurrent ? '* ' : '  ';
    const aheadFmt = b.ahead > 0 ? String(b.ahead) : '-';
    const behindFmt = b.behind > 0 ? String(b.behind) : '-';
    const author = b.lastAuthor.slice(0, maxAuthorLen).padEnd(maxAuthorLen);
    const commit = b.lastCommit.slice(0, 16).padEnd(16);
    const remote = remoteLabel(b);

    logger.plain(
      `${prefix}${b.name.padEnd(maxNameLen)}  ${aheadFmt.padStart(5)}  ${behindFmt.padStart(6)}  ${commit}  ${author}  ${remote}`,
    );
  }

  logger.plain('');
  logger.plain(
    `  Ahead/Behind vs ${config.mainBranch}. Run 'coolkit sync-from-main' to sync a branch.`,
  );
  logger.plain('');

  return { status: 'ok', branches, mainBranch: config.mainBranch };
}
