import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildCommonBranchName,
  buildCreateMrTitle,
  buildExtractCommitSubject,
  buildMergeRequestTitle,
  buildMrBranchName,
  buildStartBranchName,
  buildSuggestedMainMergeMessage,
  buildSyncBackupTag,
  slugifyBranchName,
} from './extract-labels.ts';
import { DEFAULT_CONFIG } from '../config/default-config.ts';

const formatConfig = { ...DEFAULT_CONFIG };

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
      buildCommonBranchName('feature/example', '202605260220', formatConfig),
      'common/feature-example-202605260220',
    );
  });

  it('builds common branch with desc slug when format uses descSlug', () => {
    assert.equal(
      buildCommonBranchName(
        'feature/product',
        '202605260220',
        {
          ...formatConfig,
          commonBranchFormat: '{commonBranchPrefix}/{descSlug}',
        },
        'fix-validator-null-check',
      ),
      'common/fix-validator-null-check',
    );
  });

  it('builds MR branch name from config template', () => {
    assert.equal(
      buildMrBranchName('feature/example', 'dev', '202605260220', formatConfig),
      'mr/feature-example-202605260220',
    );
  });

  it('builds start-branch names from config templates', () => {
    assert.equal(buildStartBranchName('feature', 'user-auth', formatConfig), 'feature/user-auth');
    assert.equal(buildStartBranchName('release', '1.2.0', formatConfig), 'release/1-2-0');
  });

  it('builds sync backup tag from config template', () => {
    assert.equal(
      buildSyncBackupTag('feature/example', '202605260220', formatConfig),
      'backup/feature-example-202605260220',
    );
  });

  it('builds MR title with feature branch prefix', () => {
    assert.equal(
      buildMergeRequestTitle('feature/example', '202605260220', formatConfig),
      '[feature/example] common → main (202605260220)',
    );
  });

  it('builds suggested main merge message with feature branch', () => {
    assert.equal(
      buildSuggestedMainMergeMessage(
        'feature/example',
        'common/feature-example-202605260220',
        formatConfig,
      ),
      'common: merge shared changes from feature/example (common/feature-example-202605260220 → main)',
    );
  });

  it('builds create-mr title from config template', () => {
    assert.equal(
      buildCreateMrTitle({
        sourceBranch: 'feature/example',
        targetBranch: 'dev',
        mrBranch: 'feature/example',
        timestamp: '202605260220',
        architecture: 'feature-based',
        isCheckout: false,
        config: formatConfig,
      }),
      'feature/example → dev',
    );
  });

  it('builds create-mr checkout title from config template', () => {
    assert.equal(
      buildCreateMrTitle({
        sourceBranch: 'feature/example',
        targetBranch: 'dev',
        mrBranch: 'mr/feature-example-202605260220',
        timestamp: '202605260220',
        architecture: 'feature-based',
        isCheckout: true,
        config: formatConfig,
      }),
      '[feature/example] → dev',
    );
  });

  it('respects custom commit subject format', () => {
    assert.equal(
      buildExtractCommitSubject('feature/example', '202605260220', {
        ...formatConfig,
        extractCommonCommitSubjectFormat: 'chore(common): {featureBranch} @ {timestamp}',
      }),
      'chore(common): feature/example @ 202605260220',
    );
  });

  it('leaves unknown placeholders unchanged in templates', () => {
    assert.equal(
      buildCreateMrTitle({
        sourceBranch: 'feature/x',
        targetBranch: 'dev',
        mrBranch: 'feature/x',
        timestamp: '202605260220',
        architecture: 'feature-based',
        isCheckout: false,
        config: {
          ...formatConfig,
          createMrTitleFormat: '{sourceBranch} → {unknown}',
        },
      }),
      'feature/x → {unknown}',
    );
  });
});
