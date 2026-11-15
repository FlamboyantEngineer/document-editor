#!/usr/bin/env node
// Related ordinary tests first, then the complete guard budget suite alone. Forward worker and
// selection options only to the ordinary suite: the timing gate always uses its single worker.
import { runNpm } from '@flamboyantengineer/ui-components/tooling/lib/npm.mjs';

runNpm(
  [
    'exec',
    '--',
    'vitest',
    'run',
    '--changed',
    'origin/dev',
    '--passWithNoTests',
    ...process.argv.slice(2),
  ],
  {
    stdio: 'inherit',
  },
);
runNpm(['run', 'test:guard-budgets'], { stdio: 'inherit' });
