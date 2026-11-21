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

// The font of a width's key: "<weight> <size>px "<family>"|<text>", without the size.
const fontOf = (key) => key.split('|')[0].replace(/ [\d.]+px /u, ' ');

for (const [index, baseRun] of base.runs.entries()) {
  for (const [mode, baseWidths] of modes(baseRun)) {
    const keys = Object.keys(baseWidths);
    const fonts = [...new Set(keys.map(fontOf))];
    const row = [];
    for (const [at, left] of reports.entries()) {
      for (const right of reports.slice(at + 1)) {
        const a = Object.fromEntries(modes(left.runs[index]))[mode] ?? {};
        const b = Object.fromEntries(modes(right.runs[index]))[mode] ?? {};
        const byFont = fonts.map((font) => {
          let differ = 0;
          let most = 0;
          const own = keys.filter((key) => fontOf(key) === font);
          for (const key of own) {
            const gap = Math.abs((a[key] ?? Number.NaN) - (b[key] ?? Number.NaN));
            if (gap !== 0) differ += 1;
            if (!(gap <= most)) most = gap;
          }
          return differ
            ? `${font} ${String(differ)}/${String(own.length)} max ${most.toFixed(4)}`
            : `${font} same`;
        });
        row.push(`${left.name} vs ${right.name}: ${byFont.join('; ')}`);
      }
    }
    console.log(`dpr ${String(baseRun.dpr)} ${mode}:\n  ${row.join('\n  ')}`);
  }
}
