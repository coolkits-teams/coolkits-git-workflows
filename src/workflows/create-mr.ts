import { createBranchResolver } from '../core/branch-resolver.js';
import { createGitClient } from '../core/git-client.js';
import { createWorkingTreeInspector } from '../core/working-tree.js';
import { createMrProvider } from '../providers/mr-provider.js';
import type { Config, CreateMrOptions, CreateMrResult, Logger } from '../types.js';
import {
  buildCreateMrTitle,
  buildMrBranchName,
  formatExtractTimestamp,
} from '../utils/extract-labels.js';
import { resolveMrTargetBranch } from '../utils/workflow-resolver.js';

export function runCreateMrWorkflow({
  config,
  logger,
  options = {},
}: {
  config: Config;
  logger: Logger;
  options?: CreateMrOptions;
}): CreateMrResult {
  const git = createGitClient();
  const branches = createBranchResolver({ git, config });
  const workingTree = createWorkingTreeInspector({ git });
  const provider = createMrProvider({ git, config, logger });

  logger.info('Running pre-flight checks...');

  if (!workingTree.isGitRepository()) {
    throw new Error('Not inside a git repository.');
  }

  workingTree.assertClean();

  // ── Resolve source & target ──────────────────────────────────────────────

  const sourceBranch = options.source ?? branches.resolve();
  const targetBranch = options.target ?? resolveMrTargetBranch(config, sourceBranch);

  if (sourceBranch === targetBranch) {
    throw new Error(
      `Source and target are the same branch: '${sourceBranch}'. Specify a different --target.`,
    );
  }

  logger.info(`Source:  ${sourceBranch}`);
  logger.info(`Target:  ${targetBranch}`);

  // ── Conflict detection ───────────────────────────────────────────────────

  logger.info(`Fetching ${config.remote}/${targetBranch}...`);
  git.runOrThrow(['fetch', config.remote, targetBranch]);
  const targetRef = `${config.remote}/${targetBranch}`;

  const behindCount = Number(
    git.runOrThrow(['rev-list', '--count', `${sourceBranch}..${targetRef}`]).trim(),
  );

  if (behindCount > 0) {
    logger.warn(
      `Source '${sourceBranch}' is ${behindCount.toString()} commit(s) behind '${targetRef}'.`,
    );
    if (!options.checkout) {
      logger.warn(
        `Tip: use --checkout to create a safe MR branch and resolve conflicts without touching '${sourceBranch}'.`,
      );
    }
  }

  // ── Determine the actual branch to push ──────────────────────────────────

  const timestamp = formatExtractTimestamp(new Date());
  const mrBranch = options.checkout
    ? buildMrBranchName(sourceBranch, targetBranch, timestamp, config)
    : sourceBranch;

  if (options.dryRun) {
    const label = options.checkout ? `'${mrBranch}' (from '${sourceBranch}')` : `'${sourceBranch}'`;
    logger.ok(`[DRY-RUN] Would push ${label} and open an MR/PR into '${targetBranch}'.`);
    return { status: 'dry-run', sourceBranch, targetBranch, mrBranch };
  }

  // ── Create safe MR branch (--checkout) ──────────────────────────────────

  if (options.checkout) {
    const checkoutBase = options.checkoutBase ?? 'source';

    if (checkoutBase === 'target') {
      /*
       * Base on target branch — merge source into it.
       * Surfaces conflicts locally so the developer can resolve them
       * in the MR branch without polluting the source branch.
       */
      logger.info(
        `Creating '${mrBranch}' from '${targetRef}' then merging '${sourceBranch}' into it...`,
      );
      git.runOrThrow(['checkout', '-b', mrBranch, targetRef]);

      const mergeResult = git.run(['merge', '--no-edit', sourceBranch], { stdio: 'inherit' });

      if (!mergeResult.ok) {
        logger.warn(`Merge conflicts detected in '${mrBranch}'.`);
        logger.warn('Resolve the conflicts, then run:');
        logger.plain(`  git add .`);
        logger.plain(`  git commit`);
        logger.plain(`  git push -u ${config.remote} ${mrBranch}`);
        logger.plain(
          `  Then create the MR manually: ${provider.buildMergeRequestUrl(mrBranch, targetBranch)}`,
        );
        return { status: 'conflict', sourceBranch, targetBranch, mrBranch };
      }

      logger.ok(`Merged '${sourceBranch}' into '${mrBranch}' without conflicts.`);
    } else {
      /*
       * Base on source — simple copy.
       * Clean, no conflicts at create time.
       * Conflicts (if any) will surface in the MR diff on the server.
       */
      logger.info(`Creating '${mrBranch}' from '${sourceBranch}'...`);
      git.runOrThrow(['checkout', '-b', mrBranch, sourceBranch]);
      logger.ok(`Created '${mrBranch}'.`);
    }
  } else {
    branches.checkout(sourceBranch);
  }

  // ── Push ─────────────────────────────────────────────────────────────────

  if (!options.skipPush) {
    logger.info(`Pushing '${mrBranch}' to ${config.remote}...`);
    git.runOrThrow(['push', '-u', config.remote, mrBranch], { stdio: 'inherit' });
    logger.ok(`Pushed '${mrBranch}'.`);
  }

  // ── Create MR / PR ───────────────────────────────────────────────────────

  const title =
    options.title != null && options.title.trim() !== ''
      ? options.title
      : buildCreateMrTitle({
          sourceBranch,
          targetBranch,
          mrBranch,
          timestamp,
          architecture: config.architecture,
          isCheckout: options.checkout ?? false,
          config,
        });

  const description = buildMrDescription(sourceBranch, targetBranch, mrBranch, config);

  const result = provider.createMergeRequest({
    sourceBranch: mrBranch,
    targetBranch,
    title,
    description,
    cwd: process.cwd(),
  });

  return { status: 'created', sourceBranch, targetBranch, mrBranch, url: result.url };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMrDescription(
  sourceBranch: string,
  targetBranch: string,
  mrBranch: string,
  config: Config,
): string {
  const lines = [
    `Merge \`${sourceBranch}\` into \`${targetBranch}\`.`,
    '',
    `| Field         | Value |`,
    `| ------------- | ----- |`,
    `| Architecture  | \`${config.architecture}\` |`,
    `| Source branch | \`${sourceBranch}\` |`,
    `| Target branch | \`${targetBranch}\` |`,
  ];

  if (mrBranch !== sourceBranch) {
    lines.push(`| MR branch     | \`${mrBranch}\` (safe checkout — delete after merge) |`);
  }

  lines.push(
    '',
    '_Created by [@coolkits/git-workflows](https://github.com/coolkits-teams/coolkits-git-workflows) `git-create-mr`._',
  );

  return lines.join('\n');
}
