#!/usr/bin/env node
// Compares the reports `font-widths.mjs` wrote on several systems: for the font-file measurer and
// for Canvas, in Node, the page and the worker, whether every system measured every reference width
// the same (bit for bit), and if not, how far apart, per font.
//   node scripts/font-widths-compare.mjs <report.json>...

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const reports = process.argv.slice(2).map((file) => ({
  name: basename(file, '.json'),
  ...JSON.parse(readFileSync(file, 'utf8')),
}));
if (!reports.length) throw new Error('No reports');
for (const report of reports)
  console.log(`${report.name}: ${report.os}, Chromium ${report.chromium}`);

// The font of a width's key: "<style> <weight> <size>px "<family>"|<text>", without the size.
const fontOf = (key) => key.split('|')[0].replace(/ [\d.]+px /u, ' ');

function compare(a, b) {
  const keys = Object.keys(a);
  return [...new Set(keys.map(fontOf))].map((font) => {
    const own = keys.filter((key) => fontOf(key) === font);
    let differ = 0;
    let most = 0;
    for (const key of own) {
      const gap = Math.abs(a[key] - (b[key] ?? Number.NaN));
      if (gap !== 0) differ += 1;
      if (!(gap <= most)) most = gap;
    }
    return differ ? `${font} ${String(differ)}/${String(own.length)} max ${most.toFixed(4)}` : null;
  });
}

const runs = [];
for (const report of reports) {
  for (const where of ['node', 'page', 'worker']) {
    for (const kind of ['fontFiles', 'canvas']) {
      const widths = report[where]?.[kind];
      if (widths) runs.push({ label: `${report.name} ${where}`, kind, widths, report, where });
    }
  }
}
for (const kind of ['fontFiles', 'canvas']) {
  const own = runs.filter((run) => run.kind === kind);
  const fingerprints = new Set(own.map((run) => run.report[run.where].fingerprints[kind]));
  console.log(
    `\n${kind}: ${String(own.length)} runs, ${String(fingerprints.size)} distinct fingerprint(s): ${[...fingerprints].join(', ')}`,
  );
  const [base, ...rest] = own;
  for (const run of rest) {
    const differences = compare(base.widths, run.widths).filter(Boolean);
    console.log(
      `  ${base.label} vs ${run.label}: ${differences.length ? differences.join('; ') : 'identical'}`,
    );
  }
}
