import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildCommonBranchName,
  buildMergeRequestTitle,
  buildSuggestedRootMergeMessage,
  slugifyBranchName,
} from './extract-labels.ts';

describe('slugifyBranchName', () => {
  it('preserves feature prefix in branch slug', () => {
    assert.equal(slugifyBranchName('feature/example'), 'feature-example');
  });

  it('replaces nested path separators', () => {
    assert.equal(slugifyBranchName('feature/product/catalog'), 'feature-product-catalog');
  });
});

describe('extract labels', () => {
  it('builds common branch name with full feature branch slug', () => {
    assert.equal(
      buildCommonBranchName('feature/example', '202605260220', { commonBranchPrefix: 'common' }),
      'common/feature-example-202605260220',
    );
  });

  it('builds MR title with feature branch prefix', () => {
    assert.equal(
      buildMergeRequestTitle('feature/example', '202605260220'),
      '[feature/example] common → root (202605260220)',
    );
  });

  it('builds suggested root merge message with feature branch', () => {
    assert.equal(
      buildSuggestedRootMergeMessage('feature/example', 'common/feature-example-202605260220'),
      'common: merge shared changes from feature/example (common/feature-example-202605260220 → root)',
    );
  });
});
