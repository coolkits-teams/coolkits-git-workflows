import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
  commitFile,
  commitFiles,
  createTempGitRepo,
  git,
  initRepo,
} from './__test-utils__/git-repo.ts';
import {
  changedFilesForCommit,
  isAlreadyCommitInvalidatedByUnreleased,
  isPatchAlreadyInTargetTree,
  mergeUnreleasedCommits,
  promoteDependentAlreadyCommits,
  sortCommitsChronologically,
} from './unreleased-dependency.ts';
import type { UnreleasedCommit } from './unreleased-dependency.ts';

function toCommit(hash: string, subject: string, date = '2026-09-10'): UnreleasedCommit {
  return {
    hash,
    short: hash.slice(0, 8),
    date,
    name: 'Dev',
    email: 'dev@example.com',
    subject,
  };
}

function addDetachedWorktree(repo: string, branch: string): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'coolkit-wt-'));
  git(repo, ['worktree', 'add', '--detach', dir, branch]);
  return {
    dir,
    cleanup: () => {
      try {
        git(repo, ['worktree', 'remove', '--force', dir]);
      } catch {
        rmSync(dir, { recursive: true, force: true });
        try {
          git(repo, ['worktree', 'prune']);
        } catch {
          // ignore
        }
      }
    },
  };
}

describe('sortCommitsChronologically', () => {
  it('sorts by date then hash', () => {
    const sorted = sortCommitsChronologically([
      toCommit('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'newer', '2026-09-11'),
      toCommit('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'older', '2026-09-10'),
    ]);

    assert.equal(sorted[0]?.subject, 'older');
    assert.equal(sorted[1]?.subject, 'newer');
  });
});

describe('isPatchAlreadyInTargetTree', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it('returns true when target tree already contains the commit diff', () => {
    const { dir: repo, cleanup } = createTempGitRepo('dep-patch-');
    cleanups.push(cleanup);
    initRepo(repo);

    const apiPath = 'src/api.ts';
    const broken = "const BASE_URL = '/api';\nexport const load = () => 'http://localhost';\n";
    const correct = "const BASE_URL = '/api';\nexport const load = () => BASE_URL;\n";

    git(repo, ['checkout', '-b', 'target']);
    commitFile(repo, apiPath, correct, 'target: correct api');

    git(repo, ['checkout', '-b', 'source']);
    commitFile(repo, apiPath, broken, 'mistake: localhost');
    const fixHash = commitFile(repo, apiPath, correct, 'fix: restore BASE_URL');

    const worktree = addDetachedWorktree(repo, 'target');
    cleanups.push(worktree.cleanup);

    assert.equal(isPatchAlreadyInTargetTree(worktree.dir, fixHash, repo), true);
  });
});

describe('promoteDependentAlreadyCommits', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it('promotes only the follow-up fix that becomes required after feat+localhost', () => {
    const { dir: repo, cleanup } = createTempGitRepo('dep-promote-');
    cleanups.push(cleanup);
    initRepo(repo);

    const apiPath = 'src/api.ts';
    const featurePath = 'src/feature.ts';
    const correct = "const BASE_URL = '/api';\nexport const load = () => BASE_URL;\n";

    git(repo, ['checkout', '-b', 'target']);
    commitFile(repo, apiPath, correct, 'target: correct api');

    git(repo, ['checkout', '-b', 'source']);
    const featHash = commitFiles(
      repo,
      {
        [apiPath]:
          "const BASE_URL = '/api';\nexport const load = () => 'http://localhost:5035/api';\n",
        [featurePath]: 'export const feature = true;\n',
      },
      'feat: add feature and localhost debug',
    );
    const fixHash = commitFile(repo, apiPath, correct, 'fix: restore BASE_URL');

    const worktree = addDetachedWorktree(repo, 'target');
    cleanups.push(worktree.cleanup);

    const featCommit = toCommit(featHash, 'feat: add feature and localhost debug', '2026-09-10');
    const fixCommit = toCommit(fixHash, 'fix: restore BASE_URL', '2026-09-11');

    const { stillAlready, promoted } = promoteDependentAlreadyCommits({
      already: [fixCommit],
      unreleased: [featCommit],
      worktreeDir: worktree.dir,
      repoDir: repo,
    });

    assert.deepEqual(
      promoted.map((commit) => commit.hash),
      [fixHash],
    );
    assert.equal(stillAlready.length, 0);
    assert.equal(
      isAlreadyCommitInvalidatedByUnreleased(fixCommit, [featCommit], worktree.dir, repo),
      true,
    );
  });

  it('does not promote a noop fix when unreleased commits touch different files', () => {
    const { dir: repo, cleanup } = createTempGitRepo('dep-noop-');
    cleanups.push(cleanup);
    initRepo(repo);

    git(repo, ['checkout', '-b', 'target']);
    commitFile(repo, 'src/api.ts', "export const api = 'v2';\n", 'target api');

    git(repo, ['checkout', '-b', 'source']);
    commitFile(repo, 'src/api.ts', "export const api = 'v1';\n", 'mistake on source');
    const unreleasedHash = commitFile(
      repo,
      'src/feature.ts',
      'export const feature = 1;\n',
      'feat',
    );
    const noopFixHash = commitFile(
      repo,
      'src/api.ts',
      "export const api = 'v2';\n",
      'noop fix on source',
    );

    const worktree = addDetachedWorktree(repo, 'target');
    cleanups.push(worktree.cleanup);

    const { stillAlready, promoted } = promoteDependentAlreadyCommits({
      already: [toCommit(noopFixHash, 'noop fix on source', '2026-09-11')],
      unreleased: [toCommit(unreleasedHash, 'feat', '2026-09-10')],
      worktreeDir: worktree.dir,
      repoDir: repo,
    });

    assert.equal(promoted.length, 0);
    assert.equal(stillAlready.length, 1);
    assert.equal(changedFilesForCommit(unreleasedHash, repo).includes('src/feature.ts'), true);
    assert.equal(changedFilesForCommit(noopFixHash, repo).includes('src/api.ts'), true);
  });

  it('promotes only the dependent fix when a second already commit is unrelated', () => {
    const { dir: repo, cleanup } = createTempGitRepo('dep-mixed-');
    cleanups.push(cleanup);
    initRepo(repo);

    const apiPath = 'src/api.ts';
    const utilsPath = 'src/utils.ts';
    const correct = "export const api = 'ok';\n";

    git(repo, ['checkout', '-b', 'target']);
    const utilsBaseHash = commitFile(
      repo,
      utilsPath,
      "export const utils = 'old';\n",
      'utils base',
    );
    commitFile(repo, utilsPath, "export const utils = 'target';\n", 'target utils');
    commitFile(repo, apiPath, correct, 'target api');

    git(repo, ['checkout', utilsBaseHash]);
    git(repo, ['checkout', '-b', 'source']);
    const duplicateUtilsHash = commitFile(
      repo,
      utilsPath,
      "export const utils = 'target';\n",
      'chore: duplicate utils noop',
    );
    const featHash = commitFile(
      repo,
      apiPath,
      "export const api = 'http://localhost';\n",
      'feat: localhost',
    );
    const fixHash = commitFile(repo, apiPath, correct, 'fix: restore api');

    const worktree = addDetachedWorktree(repo, 'target');
    cleanups.push(worktree.cleanup);

    const { promoted, stillAlready } = promoteDependentAlreadyCommits({
      already: [
        toCommit(duplicateUtilsHash, 'chore: duplicate utils noop', '2026-09-09'),
        toCommit(fixHash, 'fix: restore api', '2026-09-11'),
      ],
      unreleased: [toCommit(featHash, 'feat: localhost', '2026-09-10')],
      worktreeDir: worktree.dir,
      repoDir: repo,
    });

    assert.deepEqual(
      promoted.map((commit) => commit.hash),
      [fixHash],
    );
    assert.deepEqual(
      stillAlready.map((commit) => commit.hash),
      [duplicateUtilsHash],
    );
  });
});

describe('mergeUnreleasedCommits', () => {
  it('deduplicates and sorts chronologically', () => {
    const merged = mergeUnreleasedCommits(
      [toCommit('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'new unreleased', '2026-09-11')],
      [toCommit('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'promoted fix', '2026-09-10')],
    );

    assert.equal(merged.length, 2);
    assert.equal(merged[0]?.subject, 'promoted fix');
    assert.equal(merged[1]?.subject, 'new unreleased');
  });
});
