import type { Config, GitClient, Logger, MrProvider } from '../types.js';
import { createGitHubProvider } from './github-provider.js';
import { createGitLabProvider } from './gitlab-provider.js';

/**
 * Factory that selects the right MR/PR provider based on `config.mergeRequestProvider`.
 *
 * - 'gitlab' → glab CLI (GitLab)
 * - 'github' → gh CLI (GitHub)
 * - 'none'   → always print browser URL, never call any CLI
 */
export function createMrProvider({
  git,
  config,
  logger,
}: {
  git: GitClient;
  config: Config;
  logger: Logger;
}): MrProvider {
  if (config.mergeRequestProvider === 'github') {
    return createGitHubProvider({ git, config, logger });
  }

  if (config.mergeRequestProvider === 'gitlab') {
    return createGitLabProvider({ git, config, logger });
  }

  // 'none' — URL-only fallback provider
  const getRepoUrl = (): string =>
    git
      .runOrThrow(['remote', 'get-url', config.remote])
      .trim()
      .replace(/\.git$/, '');

  return {
    buildMergeRequestUrl: (sourceBranch: string, targetBranch: string): string => {
      const params = new URLSearchParams({
        source: sourceBranch,
        target: targetBranch,
      });
      return `${getRepoUrl()}?${params.toString()}`;
    },
    createMergeRequest: ({
      sourceBranch,
      targetBranch,
    }): {
      ok: boolean;
      reason: string;
      url: string;
    } => {
      const url = getRepoUrl();
      logger.warn('MR provider is set to "none". Create the merge request manually:');
      logger.plain(`  Source: ${sourceBranch}`);
      logger.plain(`  Target: ${targetBranch}`);
      logger.plain(`  Repo:   ${url}`);
      return { ok: false, reason: 'provider-none', url };
    },
  };
}
