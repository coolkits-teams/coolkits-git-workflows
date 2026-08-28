import { createGitClient } from '../core/git-client.js';
import type { Config, GitClient, Logger } from '../types.js';

export interface PruneBranchesOptions {
  dryRun?: boolean;
  nukeLocal?: boolean;
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

  if (options.nukeLocal === true) {
    runNukeLocal({ git, config, logger, dryRun: options.dryRun ?? false });
    return;
  }

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

function runNukeLocal({
  git,
  config,
  logger,
  dryRun,
}: {
  git: GitClient;
  config: Config;
  logger: Logger;
  dryRun: boolean;
}): void {
  const mainBranch = config.mainBranch;

  logger.info(`Checking out '${mainBranch}'...`);
  if (!dryRun) {
    git.runOrThrow(['checkout', mainBranch], { stdio: 'inherit' });
  }

  const allBranches = git
    .runOrThrow(['branch'])
    .split('\n')
    .map((line) => line.trim().replace(/^\*\s*/, ''))
    .filter((name): name is string => Boolean(name) && name !== mainBranch);

  if (allBranches.length === 0) {
    logger.ok(`No other local branches found — already clean.`);
    return;
  }

  logger.info(`Found ${allBranches.length.toString()} local branch(es) to delete:`);
  allBranches.forEach((b) => {
    logger.plain(`  - ${b}`);
  });

  if (dryRun) {
    logger.ok('[DRY-RUN] Would delete the branches listed above. Run without --dry-run to apply.');
    return;
  }

  let deleted = 0;
  for (const branch of allBranches) {
    const result = git.run(['branch', '-D', branch]);
    if (result.ok) {
      logger.ok(`Deleted: ${branch}`);
      deleted++;
    } else {
      logger.warn(`Failed to delete '${branch}': ${result.stderr.trim()}`);
    }
  }

  logger.ok(
    `Nuked ${deleted.toString()} of ${allBranches.length.toString()} branch(es). Only '${mainBranch}' remains.`,
  );
}
