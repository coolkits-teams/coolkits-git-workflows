import { createGitClient } from '../core/git-client.js';
import { GitControlsError } from '../errors.js';
import type { Config, Logger } from '../types.js';

export interface TagDeleteOptions {
  tag: string;
  localOnly?: boolean;
  remoteOnly?: boolean;
}

export function runTagDeleteWorkflow({
  config,
  logger,
  options,
}: {
  config: Config;
  logger: Logger;
  options: TagDeleteOptions;
}): void {
  const git = createGitClient();
  const { tag } = options;

  const deleteLocal = options.remoteOnly !== true;
  const deleteRemote = options.localOnly !== true;

  if (deleteLocal) {
    const localExists = git.run(['rev-parse', '--verify', `refs/tags/${tag}`]).ok;
    if (localExists) {
      git.runOrThrow(['tag', '-d', tag]);
      logger.ok(`Deleted local tag '${tag}'.`);
    } else {
      logger.warn(`Local tag '${tag}' not found — skipping local deletion.`);
    }
  }

  if (deleteRemote) {
    logger.info(`Deleting remote tag '${tag}' from ${config.remote}...`);
    const result = git.run(['push', config.remote, '--delete', tag], { stdio: 'inherit' });
    if (!result.ok) {
      throw new GitControlsError(`Failed to delete remote tag '${tag}' from ${config.remote}.`, [
        'The tag may not exist on the remote, or you may lack push permissions.',
      ]);
    }
    logger.ok(`Deleted remote tag '${tag}' from ${config.remote}.`);
  }
}
