import { defineConfig, devices } from '@playwright/test';
// @ts-expect-error The scripts are plain JavaScript modules without declarations.
import { LABS_HOST, LABS_PORT } from './scripts/lib/labs.mjs';

const origin = `http://${String(LABS_HOST)}:${String(LABS_PORT)}`;
// A browser of the machine's own, when Playwright's is not installed.
const executablePath = process.env.CHROMIUM_PATH;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  workers: 4,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: `${origin}/`,
    // Rerun a failing test with `--trace=on` to record one.
    trace: 'off',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: {
    command: 'node scripts/serve-labs.mjs',
    url: `${origin}/index.html`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /\.performance\.spec\.ts$/,
    },
    // Timing budgets run after every other test, with no other worker sharing the machine.
    {
      name: 'performance',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /\.performance\.spec\.ts$/,
      dependencies: ['chromium'],
      fullyParallel: false,
    },
  ],
});
