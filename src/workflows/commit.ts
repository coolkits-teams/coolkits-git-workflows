import { createGitClient } from '../core/git-client.js';
import { GitControlsError } from '../errors.js';
import type { Config, Logger } from '../types.js';

export interface CommitOptions {
  /** Conventional commit type (feat, fix, chore, refactor, docs, test, style, ci, build, perf). */
  type?: string | null;
  /** Scope (e.g. "auth", "payment"). */
  scope?: string | null;
  /** Short description (imperative mood). */
  message?: string | null;
  /** Optional longer body paragraph. */
  body?: string | null;
  /** Breaking change description — adds BREAKING CHANGE footer. */
  breaking?: string | null;
  /** Run git add -A before committing. */
  all?: boolean;
}

export interface CommitResult {
  status: 'committed';
  subject: string;
}

const VALID_TYPES = [
  'feat',
  'fix',
  'chore',
  'refactor',
  'docs',
  'test',
  'style',
  'ci',
  'build',
  'perf',
  'revert',
];

export function runCommitWorkflow({
  config,
  logger,
  options,
}: {
  config: Config;
  logger: Logger;
  options: CommitOptions;
}): CommitResult {
  const git = createGitClient();

  const type = options.type?.trim();
  const scope = options.scope?.trim();
  const message = options.message?.trim();

  if (!type)
    throw new GitControlsError('Commit type is required.', [
      `Valid types: ${VALID_TYPES.join(', ')}`,
    ]);
  if (!message) throw new GitControlsError('Commit message/description is required.');

  if (!VALID_TYPES.includes(type)) {
    throw new GitControlsError(`Unknown commit type '${type}'.`, [
      `Valid types: ${VALID_TYPES.join(', ')}`,
    ]);
  }

  if (options.all === true) {
    logger.info('Staging all changes (git add -A)...');
    git.runOrThrow(['add', '-A']);
  }

  // Verify there are staged changes
  const staged = git.run(['diff', '--cached', '--name-only']).stdout.trim();
  if (!staged) {
    const dirty = git.run(['status', '--porcelain']).stdout.trim();
    if (!dirty) {
      throw new GitControlsError('Nothing to commit — working tree is clean.');
    }
    throw new GitControlsError('No staged changes.', [
      'Stage files first: git add <file>',
      'Or stage everything: coolkit commit --all ...',
    ]);
  }

  // Build conventional commit subject
  const subject = scope ? `${type}(${scope}): ${message}` : `${type}: ${message}`;

  let fullMessage = subject;
  if (options.body?.trim()) {
    fullMessage += `\n\n${options.body.trim()}`;
  }
  if (options.breaking?.trim()) {
    fullMessage += `\n\nBREAKING CHANGE: ${options.breaking.trim()}`;
  }

  logger.info(`Committing: ${subject}`);
  git.runOrThrow(['commit', '-m', fullMessage], { stdio: 'inherit' });
  logger.ok(`Committed: "${subject}"`);

  // Show semver bump hint if configured
  const bumpHint = config.semverBumpByCommitType[type];
  const effectiveBump = options.breaking?.trim() ? 'major' : bumpHint;
  if (effectiveBump && effectiveBump !== 'none') {
    logger.plain(`  Semver hint: ${effectiveBump} bump`);
  }

  return { status: 'committed', subject };
}
