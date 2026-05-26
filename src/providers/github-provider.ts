import { spawnSync } from 'child_process';

import type {
  Config,
  GitClient,
  Logger,
  MergeRequestParams,
  MergeRequestResult,
  MrProvider,
} from '../types.js';

export function createGitHubProvider({
  git,
  config,
  logger,
}: {
  git: GitClient;
  config: Config;
  logger: Logger;
}): MrProvider {
  const getRepoUrl = (): string =>
    git
      .runOrThrow(['remote', 'get-url', config.remote])
      .trim()
      .replace(/\.git$/, '');

  const buildMergeRequestUrl = (sourceBranch: string, targetBranch: string): string => {
    const repoUrl = getRepoUrl();
    // GitHub compare URL: /compare/<target>...<source>
    return `${repoUrl}/compare/${targetBranch}...${sourceBranch}`;
  };

  const isGhInstalled = (): boolean =>
    spawnSync('gh', ['--version'], { encoding: 'utf8', stdio: 'pipe' }).status === 0;

  const isGhAuthenticated = (): boolean =>
    spawnSync('gh', ['auth', 'status'], { encoding: 'utf8', stdio: 'pipe' }).status === 0;

  const createMergeRequest = ({
    sourceBranch,
    targetBranch,
    title,
    description,
    cwd,
  }: MergeRequestParams): MergeRequestResult => {
    const prUrl = buildMergeRequestUrl(sourceBranch, targetBranch);

    if (!isGhInstalled()) {
      logger.warn('`gh` CLI not found — create the pull request manually:');
      logger.warn('  Install: https://cli.github.com');
      logger.plain(`  ${prUrl}`);
      return { ok: false, reason: 'gh-not-found', url: prUrl };
    }

    if (!isGhAuthenticated()) {
      logger.warn('`gh` is installed but not authenticated.');
      logger.warn('  Run: gh auth login');
      logger.warn('  Then retry the command.');
      logger.plain(`  Manual URL: ${prUrl}`);
      return { ok: false, reason: 'gh-not-authenticated', url: prUrl };
    }

    logger.info(`Creating pull request via gh: ${sourceBranch} → ${targetBranch}...`);

    const result = spawnSync(
      'gh',
      [
        'pr',
        'create',
        '--head',
        sourceBranch,
        '--base',
        targetBranch,
        '--title',
        title,
        '--body',
        description,
      ],
      { encoding: 'utf8', cwd, stdio: 'inherit' },
    );

    if (result.status !== 0) {
      logger.warn('gh pull request creation failed. Fallback URL:');
      logger.plain(`  ${prUrl}`);
      return { ok: false, reason: 'gh-failed', url: prUrl };
    }

    logger.ok('Pull request created successfully.');
    return { ok: true, url: prUrl };
  };

  return { createMergeRequest, buildMergeRequestUrl };
}
