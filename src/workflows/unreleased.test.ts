import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { createGitClient } from '../core/git-client.ts';
import {
  commitFile,
  commitFiles,
  createTempGitRepo,
  git,
  initRepo,
} from './__test-utils__/git-repo.ts';
import { classifyUnreleasedCommits, listCommits } from './unreleased-dependency.ts';

describe('classifyUnreleasedCommits', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  function setupQtkd5924LikeRepo(): {
    repo: string;
    featHash: string;
    fixHash: string;
    duplicateHash: string;
    choreHash: string;
  } {
    const { dir: repo, cleanup: repoCleanup } = createTempGitRepo('unreleased-int-');
    cleanups.push(repoCleanup);
    initRepo(repo);

    const apiPath = 'src/shared/api/priceListTemplate.api.ts';
    const featurePath = 'src/features/price-list/Feature.tsx';
    const utilsPath = 'src/shared/utils/flaky.ts';
    const correctApi =
      "const BASE_URL = '/v1/ps/price-table-templates';\nexport const load = () => BASE_URL;\n";

    git(repo, ['checkout', '-b', 'pre-uat']);
    commitFile(repo, apiPath, correctApi, 'target api');
    commitFile(repo, utilsPath, 'export const fixed = true;\n', 'feat(dnc): fix flaky test');

    const apiOnlyHash = git(repo, ['rev-parse', 'HEAD~1']);
    git(repo, ['checkout', apiOnlyHash]);
    git(repo, ['checkout', '-b', 'qa']);
    const duplicateHash = commitFile(
      repo,
      utilsPath,
      'export const fixed = true;\n',
      'feat(dnc): fix flaky test on qa',
    );
    const featHash = commitFiles(
      repo,
      {
        [apiPath]:
          "const BASE_URL = '/v1/ps/price-table-templates';\nexport const load = () => 'http://localhost:5035/api/v1/ps/price-table-templates';\n",
        [featurePath]: 'export const pinned = true;\n',
      },
      'feat(pricing): QTKD-5924 pinned-selected-item',
    );
    const fixHash = commitFile(
      repo,
      apiPath,
      correctApi,
      'fix(priceListTemplate): restore BASE_URL',
    );
    const choreHash = commitFile(repo, '.gitignore', 'node_modules\n', 'chore: update gitignore');

    return { repo, featHash, fixHash, duplicateHash, choreHash };
  }

  it('marks duplicate patch as already skip without promoting it', () => {
    const { repo, featHash, fixHash, duplicateHash, choreHash } = setupQtkd5924LikeRepo();
    const gitClient = createGitClient({ cwd: repo });

    const commits = listCommits(gitClient, 'refs/heads/qa', 'refs/heads/pre-uat', null);
    const result = classifyUnreleasedCommits({
      git: gitClient,
      source: 'refs/heads/qa',
      target: 'refs/heads/pre-uat',
      commits,
    });

    const skippedSubjects = result.skipped.map((row) => row.commit.subject);
    const unreleasedHashes = result.unreleased.map((commit) => commit.hash);
    const promotedHashes = result.promoted.map((commit) => commit.hash);

    const duplicateRow = result.skipped.find((row) => row.commit.hash === duplicateHash);
    assert.ok(duplicateRow, 'duplicate patch on target must stay in skip');
    assert.ok(
      duplicateRow.reason === 'already' || duplicateRow.reason === 'ported',
      `duplicate patch should be already or ported, got ${duplicateRow.reason}`,
    );
    assert.equal(skippedSubjects.includes('feat(dnc): fix flaky test on qa'), true);
    assert.equal(unreleasedHashes.includes(featHash), true);
    assert.equal(unreleasedHashes.includes(choreHash), true);
    assert.equal(promotedHashes.includes(fixHash), true);
    assert.equal(
      result.skipped.some((row) => row.commit.hash === fixHash),
      false,
      'dependent fix must not remain in skip',
    );
    assert.equal(result.counts.promoted, 1);
    assert.equal(
      result.promoted.some((commit) => commit.hash === fixHash),
      true,
    );
    assert.equal(
      result.skipped.some((row) => row.commit.hash === duplicateHash),
      true,
    );
    assert.equal(result.unreleased.length, 3);
  });

  it('keeps ported commits in skip and never promotes them', () => {
    const { dir: repo, cleanup: repoCleanup } = createTempGitRepo('unreleased-ported-');
    cleanups.push(repoCleanup);
    initRepo(repo);

    git(repo, ['checkout', '-b', 'pre-uat']);
    commitFile(repo, 'src/a.ts', 'export const a = 1;\n', 'fix: shared title on target');

    git(repo, ['checkout', '-b', 'qa']);
    const unreleasedHash = commitFile(repo, 'src/b.ts', 'export const b = 1;\n', 'feat: new file');
    const portedHash = commitFile(
      repo,
      'src/a.ts',
      'export const a = 2;\n',
      'fix: shared title on target',
    );

    const gitClient = createGitClient({ cwd: repo });
    const commits = listCommits(gitClient, 'refs/heads/qa', 'refs/heads/pre-uat', null);
    const result = classifyUnreleasedCommits({
      git: gitClient,
      source: 'refs/heads/qa',
      target: 'refs/heads/pre-uat',
      commits,
    });

    assert.equal(
      result.skipped.some((row) => row.reason === 'ported' && row.commit.hash === portedHash),
      true,
    );
    assert.equal(result.promoted.length, 0);
    assert.deepEqual(
      result.unreleased.map((commit) => commit.hash),
      [unreleasedHash],
    );
  });

  it('keeps ambiguous commits in skip and never promotes them', () => {
    const { dir: repo, cleanup: repoCleanup } = createTempGitRepo('unreleased-ambiguous-');
    cleanups.push(repoCleanup);
    initRepo(repo);

    git(repo, ['checkout', '-b', 'pre-uat']);
    commitFile(repo, 'src/a.ts', 'export const a = 1;\n', 'fix: duplicate title');
    commitFile(repo, 'src/c.ts', 'export const c = 1;\n', 'fix: duplicate title');

    git(repo, ['checkout', '-b', 'qa']);
    const unreleasedHash = commitFile(repo, 'src/b.ts', 'export const b = 1;\n', 'feat: new file');
    const ambiguousHash = commitFile(
      repo,
      'src/d.ts',
      'export const d = 1;\n',
      'fix: duplicate title',
    );

    const gitClient = createGitClient({ cwd: repo });
    const commits = listCommits(gitClient, 'refs/heads/qa', 'refs/heads/pre-uat', null);
    const result = classifyUnreleasedCommits({
      git: gitClient,
      source: 'refs/heads/qa',
      target: 'refs/heads/pre-uat',
      commits,
    });

    assert.equal(
      result.skipped.some((row) => row.reason === 'ambiguous' && row.commit.hash === ambiguousHash),
      true,
    );
    assert.equal(result.promoted.length, 0);
    assert.deepEqual(
      result.unreleased.map((commit) => commit.hash),
      [unreleasedHash],
    );
  });

  it('does not promote when every candidate is already on target', () => {
    const { dir: repo, cleanup: repoCleanup } = createTempGitRepo('unreleased-only-skip-');
    cleanups.push(repoCleanup);
    initRepo(repo);

    const utilsPath = 'src/utils.ts';

    git(repo, ['checkout', '-b', 'pre-uat']);
    const baseHash = commitFile(repo, utilsPath, 'export const v = 0;\n', 'base');
    commitFile(repo, utilsPath, 'export const v = 1;\n', 'chore: noop on target');

    git(repo, ['checkout', baseHash]);
    git(repo, ['checkout', '-b', 'qa']);
    commitFile(repo, utilsPath, 'export const v = 1;\n', 'chore: noop on target');

    const gitClient = createGitClient({ cwd: repo });
    const commits = listCommits(gitClient, 'refs/heads/qa', 'refs/heads/pre-uat', null);
    const result = classifyUnreleasedCommits({
      git: gitClient,
      source: 'refs/heads/qa',
      target: 'refs/heads/pre-uat',
      commits,
    });

    assert.equal(result.unreleased.length, 0);
    assert.equal(result.promoted.length, 0);
    assert.equal(
      result.skipped.every((row) => row.reason === 'already'),
      true,
    );
  });
});
