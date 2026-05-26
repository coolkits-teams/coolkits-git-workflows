import { createGitClient } from '../core/git-client.js';
import { GitControlsError } from '../errors.js';
import type { Logger } from '../types.js';

export interface SearchCommitsOptions {
  /** Search commit messages. */
  message?: string | null;
  /** Search for changes that add or remove a string (git log -S). */
  content?: string | null;
  /** Limit results (default: 20). */
  limit?: number;
  /** Search across all branches (default: true). */
  all?: boolean;
}

export function runSearchCommitsWorkflow({
  logger,
  options,
}: {
  logger: Logger;
  options: SearchCommitsOptions;
}): void {
  const git = createGitClient();

  const hasMessage = options.message != null && options.message.trim() !== '';
  const hasContent = options.content != null && options.content.trim() !== '';

  if (!hasMessage && !hasContent) {
    throw new GitControlsError('Provide --message or --content to search.');
  }

  const limit = options.limit ?? 20;
  const searchAll = options.all !== false;

  const args = [
    'log',
    '--oneline',
    '--format=%C(yellow)%h%Creset %C(cyan)%ad%Creset %C(green)%an%Creset %s',
    '--date=short',
    `-${limit.toString()}`,
  ];

  if (searchAll) args.push('--all');

  if (hasMessage && options.message != null) {
    args.push('--grep', options.message);
    logger.info(`Searching commit messages for: "${options.message}"`);
  }

  if (hasContent && options.content != null) {
    // -S searches for commits that change the number of occurrences of the string
    args.push('-S', options.content);
    logger.info(`Searching code changes for: "${options.content}"`);
  }

  const result = git.run(args);

  if (!result.stdout.trim()) {
    logger.warn('No commits found matching your search.');
    logger.plain('Tips:');
    logger.plain('  --message is case-insensitive by default in git grep');
    logger.plain('  --content searches added/removed lines, not current file content');
    return;
  }

  const lines = result.stdout.trim().split('\n');
  logger.plain(`Found ${lines.length.toString()} commit(s):\n`);
  lines.forEach((line) => {
    logger.plain(`  ${line}`);
  });

  if (lines.length === limit) {
    logger.plain('');
    logger.warn(`Showing first ${limit.toString()} results. Use --limit to show more.`);
  }
}
