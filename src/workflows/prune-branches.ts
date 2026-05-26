import { createGitClient } from '../core/git-client.js';
import type { Config, Logger } from '../types.js';

export interface PruneBranchesOptions {
  dryRun?: boolean;
}

export function runPruneBranchesWorkflow({
  config,
  logger,
  options = {},
}: {
  config: Config;
  logger: Logger;
  options?: PruneBranchesOptions;
}): void {
  const git = createGitClient();

  // 1. Prune stale remote-tracking refs
  logger.info(`Fetching and pruning stale remote refs from '${config.remote}'...`);
  git.runOrThrow(['fetch', '--prune', config.remote], { stdio: 'inherit' });

  // 2. Find local branches whose remote tracking branch no longer exists
  const gone = git
    .runOrThrow(['branch', '-vv'])
    .split('\n')
    .filter((line) => line.includes(': gone]'))
    .map(
      (line) =>
        line
          .trim()
          .replace(/^\*\s+/, '')
          .split(/\s+/)[0],
    )
    .filter((name): name is string => Boolean(name));

  if (gone.length === 0) {
    logger.ok('No stale local branches found — everything is clean.');
    return;
  }

  logger.info(`Found ${gone.length.toString()} stale local branch(es) (remote gone):`);
  gone.forEach((b) => {
    logger.plain(`  - ${b}`);
  });

  if (options.dryRun === true) {
    logger.ok('[DRY-RUN] Would delete the branches listed above. Run without --dry-run to apply.');
    return;
  }

  let deleted = 0;
  for (const branch of gone) {
    const result = git.run(['branch', '-d', branch]);
    if (result.ok) {
      logger.ok(`Deleted: ${branch}`);
      deleted++;
    } else {
      // Branch has unmerged commits — skip with a warning
      logger.warn(
        `Skipped '${branch}' (has unmerged commits). Delete manually: git branch -D ${branch}`,
      );
    }
  }

  logger.ok(`Pruned ${deleted.toString()} of ${gone.length.toString()} stale branch(es).`);
}
