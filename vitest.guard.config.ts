import { defineConfig } from 'vitest/config';
import config from './vitest.config.js';

// Keep the functional guard cases and both timing budgets together, without competing test files.
export default defineConfig({
  ...config,
  test: {
    ...config.test,
    include: ['src/collab/room-change-guard.test.ts', 'src/collab/room-change-guard-perf.test.ts'],
    exclude: [],
    maxWorkers: 1,
    fileParallelism: false,
  },
});
