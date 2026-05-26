import { createGitClient } from '../core/git-client.js';
import { GitControlsError } from '../errors.js';
import type { Config, Logger } from '../types.js';

export interface TagCreateOptions {
  tag: string;
  message?: string | null;
  /** Commit to tag. Default: HEAD. */
  commit?: string | null;
  skipPush?: boolean;
}

export function runTagCreateWorkflow({
  config,
  logger,
  options,
}: {
  config: Config;
  logger: Logger;
  options: TagCreateOptions;
}): void {
  const git = createGitClient();
  const { tag } = options;

  // Check the tag doesn't already exist
  const exists = git.run(['rev-parse', '--verify', `refs/tags/${tag}`]).ok;
  if (exists) {
    throw new GitControlsError(`Tag '${tag}' already exists.`, [
      `To delete it first: yarn git:tag-delete ${tag}`,
    ]);
  }

  const commitRef = options.commit ?? 'HEAD';
  const shortHash = git.runOrThrow(['rev-parse', '--short', commitRef]).trim();
  const message = options.message ?? `Release ${tag}`;

  logger.info(`Creating annotated tag '${tag}' at ${shortHash}...`);

  // Annotated tag (-a) stores tagger name, email, date and message
  git.runOrThrow(['tag', '-a', tag, commitRef, '-m', message]);

  logger.ok(`Tag '${tag}' created at ${shortHash}.`);
  logger.plain(`  Message: "${message}"`);

  if (!options.skipPush) {
    logger.info(`Pushing tag to ${config.remote}...`);
    git.runOrThrow(['push', config.remote, tag], { stdio: 'inherit' });
    logger.ok(`Tag '${tag}' pushed to ${config.remote}.`);
  } else {
    logger.plain(`  To push manually: git push ${config.remote} ${tag}`);
  }
}
