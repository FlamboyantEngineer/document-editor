import { defineConfig, devices } from '@playwright/test';
// @ts-expect-error The scripts are plain JavaScript modules without declarations.
import { LABS_HOST, LABS_PORT } from './scripts/lib/labs.mjs';

const origin = `http://${String(LABS_HOST)}:${String(LABS_PORT)}`;
// A browser of the machine's own, when Playwright's is not installed.
const executablePath = process.env.CHROMIUM_PATH;
// The HTML-in-Canvas API, which pages painted into a canvas use (DOCE-EDITOR-1.9), is behind this
// switch before Chromium 157 (Playwright's Chromium is 159, which has it on); it changes nothing else.
const HTML_IN_CANVAS = '--enable-blink-features=CanvasDrawElement';
// The one-result invariant's page checks of each document at a zoom, and in a canvas (DOCE-LABS-8.1,
// 8.9), which the `chromium-invariant` project runs at a device pixel ratio of 1.
const INVARIANT_PAGES = /DOCE-LABS-8\.(1 [a-z-]+ at \d+%|9 [a-z-]+ at \d+% in a canvas)$/;

// Chromium at a real device pixel ratio, which changes its layout unit. Playwright's emulated
// `deviceScaleFactor` does not, so the browser is launched with the ratio and no emulated viewport.
function devicePixelRatio(
  ratio: number,
  testMatch: readonly RegExp[] = [
    /\/pretext-pagination-fuzz\.spec\.ts$/,
    /\/layout-invariant\.spec\.ts$/,
    /\/canvas-pages\.spec\.ts$/,
  ],
) {
  return {
    name: `chromium-dpr-${String(ratio)}`,
    use: {
      browserName: 'chromium' as const,
      viewport: null,
      launchOptions: {
        args: [
          `--force-device-scale-factor=${String(ratio)}`,
          '--window-size=1280,720',
          HTML_IN_CANVAS,
        ],
        ...(executablePath ? { executablePath } : {}),
      },
    },
    testMatch: [...testMatch],
  };
}

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
    launchOptions: { args: [HTML_IN_CANVAS], ...(executablePath ? { executablePath } : {}) },
  },
  webServer: {
    command: 'node scripts/serve-labs.mjs --strict-port',
    url: `${origin}/index.html`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: [/\.performance\.spec\.ts$/, /\/performance\.spec\.ts$/],
      // Left out, not skipped: a skipped test still takes its place when CI shards the list.
      grepInvert: INVARIANT_PAGES,
    },
    // The one-result invariant's page checks at a device pixel ratio of 1, every zoom, and its pages
    // painted into a canvas (DOCE-LABS-8.1, 8.9): the heaviest tests, in a project of their own so CI
    // shares them out evenly between its shards.
    {
      name: 'chromium-invariant',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /\/layout-invariant\.spec\.ts$/,
      grep: INVARIANT_PAGES,
    },
    // How close the Pretext prediction is to the browser (DOCE-LABS-5.6), and that the editor draws
    // the lines it computed (DOCE-LABS-8), at real device pixel ratios.
    devicePixelRatio(1.25),
    devicePixelRatio(2),
    // The one-result invariant at the ratios of display scaling at 150, 175 and 300 percent.
    devicePixelRatio(1.5, [/\/layout-invariant\.spec\.ts$/]),
    devicePixelRatio(1.75, [/\/layout-invariant\.spec\.ts$/]),
    devicePixelRatio(3, [/\/layout-invariant\.spec\.ts$/]),
    // The heaviest timing test, 300 pages beside 500 comment threads, alone after the lab tests, so
    // it slows no other timing test.
    {
      name: 'review-scale',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /\/review-scale\.performance\.spec\.ts$/,
      dependencies: ['chromium'],
    },
    // Timing budgets run after every other test, with no other worker sharing the machine.
    {
      name: 'performance',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /\.performance\.spec\.ts$/,
      testIgnore: /\/review-scale\.performance\.spec\.ts$/,
      dependencies: ['review-scale'],
      // Timing files must not compete for frames when functional tests use several workers.
      workers: 1,
      fullyParallel: false,
    },
    // The performance harness (DOCE-LABS-2.3), run on its own with `npm run test:perf`.
    {
      name: 'budgets',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /\/performance\.spec\.ts$/,
    },
  ],
});
