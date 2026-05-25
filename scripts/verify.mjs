/**
 * Pre-publish verification script.
 *
 * Runs: type-check → lint → format check → build
 * Invoked by `npm run verify` and `prepublishOnly`.
 */
import { execSync } from 'child_process';

const run = (label, cmd) => {
  process.stdout.write(`\n▶ ${label}\n`);
  execSync(cmd, { stdio: 'inherit' });
};

run('Type check', 'npm run type-check');
run('Lint', 'npm run lint');
run('Format check', 'npm run format:check');
run('Build', 'npm run build');

process.stdout.write('\n✔ verify OK\n');
