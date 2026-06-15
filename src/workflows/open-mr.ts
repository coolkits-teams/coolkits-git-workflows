import { spawnSync } from 'node:child_process';

import { createBranchResolver } from '../core/branch-resolver.js';
import { createGitClient } from '../core/git-client.js';
import { createMrProvider } from '../providers/mr-provider.js';
import type { Config, Logger } from '../types.js';
import { resolveMrTargetBranch } from '../utils/workflow-resolver.js';

export interface OpenMrOptions {
  /** Source branch. Default: current branch. */
  branch?: string | null;
  /** Override target branch. Default: architecture-aware. */
  target?: string | null;
  /** Print the URL without opening a browser. */
  printOnly?: boolean;
}

export interface OpenMrResult {
  status: 'opened' | 'url-only';
  url: string;
  sourceBranch: string;
  targetBranch: string;
}

export function runOpenMrWorkflow({
  config,
  logger,
  options = {},
}: {
  config: Config;
  logger: Logger;
  options?: OpenMrOptions;
}): OpenMrResult {
  const git = createGitClient();
  const branches = createBranchResolver({ git, config });
  const provider = createMrProvider({ git, config, logger });

  const sourceBranch = options.branch?.trim() ?? branches.resolve();
  const targetBranch = options.target?.trim() ?? resolveMrTargetBranch(config, sourceBranch);

  const url = provider.buildMergeRequestUrl(sourceBranch, targetBranch);

  logger.info(`Branch:  ${sourceBranch} → ${targetBranch}`);
  logger.plain(`  URL: ${url}`);

  if (options.printOnly === true) {
    return { status: 'url-only', url, sourceBranch, targetBranch };
  }

  // Try to open the URL in the default browser
  let opened = false;
  if (process.platform === 'darwin') {
    const result = spawnSync('open', [url], { stdio: 'ignore' });
    opened = result.status === 0;
  } else if (process.platform === 'win32') {
    const result = spawnSync('cmd', ['/c', 'start', '', url], { stdio: 'ignore' });
    opened = result.status === 0;
  } else {
    // Linux — try xdg-open, then wslview (WSL), then sensible-browser
    for (const cmd of ['xdg-open', 'wslview', 'sensible-browser']) {
      const result = spawnSync(cmd, [url], { stdio: 'ignore' });
      if (result.status === 0 && result.error == null) {
        opened = true;
        break;
      }
    }
  }

  if (opened) {
    logger.ok('Opened in browser.');
    return { status: 'opened', url, sourceBranch, targetBranch };
  }

  logger.warn('Could not open browser automatically.');
  logger.plain(`  Copy and open manually: ${url}`);
  return { status: 'url-only', url, sourceBranch, targetBranch };
}
