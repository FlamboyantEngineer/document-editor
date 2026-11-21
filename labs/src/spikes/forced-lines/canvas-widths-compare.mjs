#!/usr/bin/env node
// Compares the reports `canvas-widths.mjs` wrote on several systems: for each measuring mode and
// device pixel ratio, whether every system measured every width the same, and if not, how far apart.
//   node canvas-widths-compare.mjs <report.json>...

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const reports = process.argv.slice(2).map((file) => ({
  name: basename(file, '.json'),
  ...JSON.parse(readFileSync(file, 'utf8')),
}));
const [base] = reports;
if (!base) throw new Error('No reports');
for (const report of reports)
  console.log(`${report.name}: ${report.os}, Chromium ${report.chromium}`);

const modes = (run) => [
  ...Object.entries(run.canvas).map(([mode, widths]) => [`canvas ${mode}`, widths]),
  ...Object.entries(run.dom).map(([mode, widths]) => [`dom ${mode}`, widths]),
];

for (const [index, baseRun] of base.runs.entries()) {
  for (const [mode, baseWidths] of modes(baseRun)) {
    const keys = Object.keys(baseWidths);
    const row = [];
    for (const report of reports.slice(1)) {
      const widths = Object.fromEntries(modes(report.runs[index]))[mode] ?? {};
      let differ = 0;
      let most = 0;
      let example = '';
      for (const key of keys) {
        const gap = Math.abs((widths[key] ?? Number.NaN) - baseWidths[key]);
        if (gap !== 0) {
          differ += 1;
          if (!(gap <= most)) {
            most = gap;
            example = `${key} ${String(baseWidths[key])} vs ${String(widths[key])}`;
          }
        }
      }
      row.push(
        differ
          ? `${report.name}: ${String(differ)}/${String(keys.length)} differ, max ${most.toFixed(4)} (${example})`
          : `${report.name}: identical`,
      );
    }
    console.log(`dpr ${String(baseRun.dpr)} ${mode}: ${row.join(' | ')}`);
  }
}
