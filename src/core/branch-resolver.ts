import type { BranchResolver, Config, GitClient } from '../types.js';

export function createBranchResolver({
  git,
  config,
}: {
  git: GitClient;
  config: Config;
}): BranchResolver {
  const protectedSet = new Set(config.protectedBranches);

  const resolve = (explicitBranch?: string | null): string => {
    if (explicitBranch) return explicitBranch;

    const current = git.run(['branch', '--show-current']).stdout.trim();
    if (!current) {
      throw new Error('Detached HEAD detected. Checkout a feature branch or pass --branch.');
    }

    return current;
  };

  const ensureFeatureBranch = (branch: string): void => {
    if (protectedSet.has(branch)) {
      throw new Error(`'${branch}' is a protected branch and cannot be used as a feature branch.`);
    }
  };

  const ensureRemoteExists = (branch: string): void => {
    const remoteBranches = git.run(['ls-remote', '--heads', config.remote, branch]).stdout;
    if (!remoteBranches.includes(branch)) {
      throw new Error(`Branch '${branch}' was not found on remote '${config.remote}'.`);
    }
  };

  const checkout = (branch: string): void => {
    const currentBranch = git.runOrThrow(['branch', '--show-current']).trim();
    if (currentBranch === branch) return;

    const localExists = git.run(['show-ref', '--verify', `refs/heads/${branch}`]).ok;
    if (localExists) {
      git.runOrThrow(['checkout', branch]);
      return;
    }

    git.runOrThrow(['checkout', '-b', branch, `${config.remote}/${branch}`]);
  };

  return { resolve, ensureFeatureBranch, ensureRemoteExists, checkout };
}
