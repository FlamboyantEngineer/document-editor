// Time-balanced shards of the browser tests (DOCE-LABS-10.1). A test is named by its line of a
// Playwright `--test-list` file, `[project] › file › describe › title`, with the file relative to
// the test directory and no line or column, so that a name stays the same as the file around it
// changes.

const SEPARATOR = ' › ';
const RESULT =
  /^\s*(?:✓|✘|-)\s+\d+\s+\[([^\]]+)\] › (?:e2e\/)?([^:\s]+):\d+:\d+ › (.+?)(?: \((\d+(?:\.\d+)?)(ms|s|m)\))?\s*$/u;
const SECONDS = { ms: 0.001, s: 1, m: 60 };
// A test that skips itself still opens its page first, so none counts as free.
const LEAST_SECONDS = 0.2;

/** The test-list line of a test. */
export function testName(project, file, titles) {
  return [`[${project}]`, file, ...titles].join(SEPARATOR);
}

/**
 * The seconds each test took, from the list reporter's lines in CI logs: a skipped test takes none.
 * The log's own timestamps before each line are left out.
 */
export function recordDurations(log) {
  const durations = {};
  for (const raw of log.split('\n')) {
    const line = raw.replace(/^\S*\d{4}-\d\d-\d\dT[\d:.]+Z /u, '');
    const match = RESULT.exec(line);
    if (!match) continue;
    const [, project, file, titles = '', amount, unit] = match;
    const seconds = amount ? Number(amount) * SECONDS[unit] : 0;
    durations[testName(project, file, titles.split(SEPARATOR))] = Math.round(seconds * 10) / 10;
  }
  return Object.fromEntries(Object.entries(durations).sort(([a], [b]) => a.localeCompare(b)));
}

/** The tests of a `--list --reporter=json` report, by their test-list lines, in report order. */
export function listedTests(report) {
  const names = [];
  const visit = (suite, titles) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests)
        names.push(testName(test.projectName, spec.file, [...titles, spec.title]));
    }
    for (const child of suite.suites ?? []) visit(child, [...titles, child.title]);
  };
  for (const fileSuite of report.suites ?? []) visit(fileSuite, []);
  return names;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? 1 : (sorted[Math.floor(sorted.length / 2)] ?? 1);
}

/**
 * Deals the tests out into `count` shards of about equal time: slowest first, each to the shard
 * with the least time so far. A test with no recorded time, such as a new one, counts as the
 * median recorded test that ran, and none as less than `LEAST_SECONDS`. Tests that share a name
 * share a line, so they stay together.
 */
export function planShards(names, durations, count) {
  const fallback = median(Object.values(durations).filter((seconds) => seconds > 0));
  const units = new Map();
  for (const name of names) {
    const unit = units.get(name) ?? { tests: [], seconds: 0 };
    unit.tests.push(name);
    unit.seconds += Math.max(LEAST_SECONDS, durations[name] ?? fallback);
    units.set(name, unit);
  }
  /** @type {{ names: string[], seconds: number }[]} */
  const shards = Array.from({ length: count }, () => ({ names: [], seconds: 0 }));
  const order = [...units].sort(([a, x], [b, y]) => y.seconds - x.seconds || a.localeCompare(b));
  for (const [, unit] of order) {
    const lightest = shards.reduce((best, shard) => (shard.seconds < best.seconds ? shard : best));
    lightest.names.push(...unit.tests);
    lightest.seconds += unit.seconds;
  }
  for (const shard of shards) shard.names.sort((a, b) => a.localeCompare(b));
  return shards;
}
