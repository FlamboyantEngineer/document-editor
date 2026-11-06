import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
    setupFiles: ['test/setup.ts'],
    // Each file runs in its own VM context: a fresh jsdom window and a fresh module graph, React Aria
    // included, so native observers, queued overlay callbacks and module state cannot reach another
    // file's document. The worker threads, jsdom itself and the transform results stay loaded, so a
    // file no longer pays for a new process, a cold module loader and inlined React Aria transforms.
    pool: 'vmThreads',
    isolate: true,
    // Four workers by default; pass `--maxWorkers` to use more or fewer.
    maxWorkers: 4,
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
  },
});
