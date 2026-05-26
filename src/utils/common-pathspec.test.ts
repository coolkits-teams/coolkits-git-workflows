import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildCommonPathspec,
  directoryExcludePathspec,
  fileExcludePathspec,
  normalizePathList,
  normalizeRepoPath,
} from './common-pathspec.ts';

describe('normalizeRepoPath', () => {
  it('converts backslashes and strips trailing slashes', () => {
    assert.equal(normalizeRepoPath('packages\\git-workflows\\'), 'packages/git-workflows');
  });
});

describe('directoryExcludePathspec', () => {
  it('excludes the directory root and all nested paths', () => {
    assert.deepEqual(directoryExcludePathspec('service-worker-api'), [
      ':(exclude)service-worker-api',
      ':(exclude)service-worker-api/*',
    ]);
  });
});

describe('fileExcludePathspec', () => {
  it('excludes only the given file', () => {
    assert.deepEqual(fileExcludePathspec('public/version.json'), [':(exclude)public/version.json']);
  });
});

describe('normalizePathList', () => {
  it('deduplicates after normalization', () => {
    assert.deepEqual(normalizePathList(['a/b', 'a/b/', 'a\\b']), ['a/b']);
  });

  it('accepts a single string', () => {
    assert.deepEqual(normalizePathList('src/features'), ['src/features']);
  });
});

describe('buildCommonPathspec', () => {
  it('combines feature paths, exclude directories, and exclude files', () => {
    const pathspec = buildCommonPathspec({
      featurePath: ['src/features'],
      commonExcludePaths: ['service-worker-api', 'packages/git-workflows'],
      commonExcludeFiles: ['public/version.json', 'git-controls.config.json'],
    });

    assert.equal(pathspec[0], '.');
    assert.ok(pathspec.includes(':(exclude)src/features'));
    assert.ok(pathspec.includes(':(exclude)src/features/*'));
    assert.ok(pathspec.includes(':(exclude)service-worker-api'));
    assert.ok(pathspec.includes(':(exclude)service-worker-api/*'));
    assert.ok(pathspec.includes(':(exclude)packages/git-workflows'));
    assert.ok(pathspec.includes(':(exclude)packages/git-workflows/*'));
    assert.ok(pathspec.includes(':(exclude)public/version.json'));
    assert.ok(pathspec.includes(':(exclude)git-controls.config.json'));
    assert.equal(pathspec.filter((entry) => entry === ':(exclude)public/version.json').length, 1);
  });

  it('defaults exclude lists to empty', () => {
    assert.deepEqual(buildCommonPathspec({ featurePath: 'src/features' }), [
      '.',
      ':(exclude)src/features',
      ':(exclude)src/features/*',
    ]);
  });
});
