import { createGitClient } from '../core/git-client.js';
import { createWorkingTreeInspector } from '../core/working-tree.js';
import type {
  BranchType,
  Config,
  Logger,
  StartBranchOptions,
  StartBranchResult,
} from '../types.js';
import {
  buildCommitMessage,
  buildStartBranchName,
  slugifyNameSegment,
} from '../utils/extract-labels.js';
import {
  resolveCommitTypeForBranch,
  resolveMrTargetBranch,
  resolveStartBaseBranch,
} from '../utils/workflow-resolver.js';

export function runStartBranchWorkflow({
  config,
  logger,
  options,
}: {
  config: Config;
  logger: Logger;
  options: StartBranchOptions;
}): StartBranchResult {
  const git = createGitClient();
  const workingTree = createWorkingTreeInspector({ git });

  if (!workingTree.isGitRepository()) {
    throw new Error('Not inside a git repository.');
  }

  workingTree.assertClean();

  const type = options.type ?? 'feature';
  const { branchName, baseBranch } = resolveBranchParams({
    config,
    type,
    name: options.name,
    ...(options.from != null ? { from: options.from } : {}),
  });
  const shouldPush = options.push !== false;

  logger.info(`Fetching '${config.remote}/${baseBranch}'...`);
  git.runOrThrow(['fetch', config.remote, baseBranch]);

  const baseRef = `${config.remote}/${baseBranch}`;

  logger.info(`Creating '${branchName}' from '${baseRef}'...`);
  git.runOrThrow(['checkout', '-b', branchName, baseRef]);
  logger.ok(`Checked out new branch '${branchName}'.`);

  if (shouldPush) {
    logger.info(`Pushing '${branchName}' to ${config.remote}...`);
    git.runOrThrow(['push', '-u', config.remote, branchName], { stdio: 'inherit' });
    logger.ok(`Branch '${branchName}' tracking ${config.remote}/${branchName}.`);
  }

  logger.ok(`Ready to work on '${branchName}'.`);
  printNextSteps({ config, type, branchName, options, logger });

  return { status: 'created', branch: branchName, basedOn: baseBranch };
}

function resolveBranchParams({
  config,
  type,
  name,
  from,
}: {
  config: Config;
  type: BranchType;
  name: string;
  from?: string | null;
}): { branchName: string; baseBranch: string } {
  const branchName = buildStartBranchName(type, name, config);
  const baseBranch = from ?? resolveStartBaseBranch(config, type);

  return { branchName, baseBranch };
}

function printNextSteps({
  config,
  type,
  branchName,
  options,
  logger,
}: {
  config: Config;
  type: BranchType;
  branchName: string;
  options: StartBranchOptions;
  logger: Logger;
}): void {
  const mrTarget = resolveMrTargetBranch(config, branchName);
  const commitType = resolveCommitTypeForBranch(config, branchName);
  const scope =
    options.scope?.trim() !== '' && options.scope != null
      ? options.scope
      : slugifyNameSegment(options.name);
  const ticketId =
    options.ticketId?.trim() !== '' && options.ticketId != null ? options.ticketId : 'PROJ-000';
  const bump = config.semverBumpByCommitType[commitType] ?? 'none';

  logger.plain('');
  logger.plain('Next steps:');
  logger.plain(`  Develop on '${branchName}', then:`);
  logger.plain(`  coolkit create-mr --target ${mrTarget}`);
  if (type === 'feature' && config.architecture === 'env-flow') {
    logger.plain(
      `  coolkit extract-common --desc <short-desc> --ticket ${ticketId}  # shared code → ${config.mainBranch}`,
    );
    logger.plain(`  coolkit sync-from-main  # pull ${config.mainBranch} into feature`);
  }
  logger.plain('');
  logger.plain('Suggested commit message format:');
  logger.plain(
    `  ${buildCommitMessage(config, {
      type: commitType,
      scope,
      ticketId,
      description: 'short description',
    })}`,
  );
  if (bump !== 'none') {
    logger.plain(`  Semver hint for '${commitType}': bump ${bump} (MAJOR.MINOR.PATCH)`);
  }
}
