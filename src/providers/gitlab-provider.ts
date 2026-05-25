import { spawnSync } from 'child_process';

import type { Config, GitClient, GitLabProvider, Logger, MergeRequestResult } from '../types.js';

export function createGitLabProvider({
  git,
  config,
  logger,
}: {
  git: GitClient;
  config: Config;
  logger: Logger;
}): GitLabProvider {
  const getRepoUrl = (): string =>
    git.runOrThrow(['remote', 'get-url', config.remote]).replace(/\.git$/, '');

  const buildMergeRequestUrl = (sourceBranch: string): string => {
    const params = new URLSearchParams({
      'merge_request[source_branch]': sourceBranch,
      'merge_request[target_branch]': config.rootBranch,
    });
    return `${getRepoUrl()}/-/merge_requests/new?${params.toString()}`;
  };

  const isGlabInstalled = (): boolean =>
    spawnSync('glab', ['--version'], { encoding: 'utf8', stdio: 'pipe' }).status === 0;

  const isGlabAuthenticated = (): boolean => {
    const remoteUrl = git.run(['remote', 'get-url', config.remote]).stdout;
    const hostMatch = /(?:@|:\/\/)([^/:]+)/.exec(remoteUrl);
    const host = hostMatch?.[1];

    const args = host ? ['auth', 'status', '--hostname', host] : ['auth', 'status'];
    return spawnSync('glab', args, { encoding: 'utf8', stdio: 'pipe' }).status === 0;
  };

  const createMergeRequest = ({
    sourceBranch,
    title,
    description,
    cwd,
  }: {
    sourceBranch: string;
    title: string;
    description: string;
    cwd: string;
  }): MergeRequestResult => {
    const mrUrl = buildMergeRequestUrl(sourceBranch);

    if (!isGlabInstalled()) {
      logger.warn('`glab` CLI not found — create the merge request manually:');
      logger.warn('  Install: https://gitlab.com/gitlab-org/cli#installation');
      logger.plain(`  ${mrUrl}`);
      return { ok: false, reason: 'glab-not-found', url: mrUrl };
    }

    if (!isGlabAuthenticated()) {
      logger.warn('`glab` is installed but not authenticated for this host.');
      logger.warn('  Run: glab auth login --hostname <your-gitlab-host>');
      logger.warn('  Then retry the extract command.');
      logger.plain(`  Manual URL: ${mrUrl}`);
      return { ok: false, reason: 'glab-not-authenticated', url: mrUrl };
    }

    logger.info(`Creating merge request via glab → ${config.rootBranch}...`);

    const result = spawnSync(
      'glab',
      [
        'mr',
        'create',
        '--source-branch',
        sourceBranch,
        '--target-branch',
        config.rootBranch,
        '--title',
        title,
        '--description',
        description,
        '--remove-source-branch',
        '--yes',
      ],
      { encoding: 'utf8', cwd, stdio: 'inherit' },
    );

    if (result.status !== 0) {
      logger.warn('glab merge request creation failed. Fallback URL:');
      logger.plain(`  ${mrUrl}`);
      return { ok: false, reason: 'glab-failed', url: mrUrl };
    }

    logger.ok('Merge request created successfully.');
    return { ok: true, url: mrUrl };
  };

  return { createMergeRequest, buildMergeRequestUrl };
}
