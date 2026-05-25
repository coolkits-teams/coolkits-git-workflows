import { defineConfig } from 'tsup';

export default defineConfig([
  // Public programmatic API — emits types for library consumers
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: { resolve: false },
    clean: true,
    minify: true,
    target: 'node18',
    platform: 'node',
    outDir: 'dist',
    sourcemap: false,
  },
  // CLI entry points — standalone bundles, no types needed
  {
    entry: {
      'bin/extract-common': 'bin/extract-common.ts',
      'bin/sync-from-root': 'bin/sync-from-root.ts',
    },
    format: ['esm'],
    dts: false,
    clean: false,
    minify: true,
    target: 'node18',
    platform: 'node',
    outDir: 'dist',
    sourcemap: false,
    banner: { js: '#!/usr/bin/env node' },
  },
]);
