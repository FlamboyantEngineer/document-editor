// The forced-lines spike (Pretext plan, thread P): the document editor on pages, its top-level
// paragraphs and headings drawn on the lines Pretext computed. `?forced=off` draws the same
// document with the browser's own line breaks; `?align=` aligns every forced block, and `?suggest`
// types as suggestions; `?breaks=widget` ends lines with the break widgets tried first.

import { casesDocument, singleSectionDocument } from './spikes/forced-lines/documents.js';
import { installForcedLinesProbe } from './spikes/forced-lines/probe.js';
import { type ForcedAlignment, createForcedLines } from './spikes/forced-lines/plugin.js';
import { defaultWidth, inlineFitWidth } from './spikes/pretext/settings.js';
import { mountStressLab } from './stress/stress-lab.js';

const query = new URLSearchParams(window.location.search);
const forced = query.get('forced') !== 'off';
const ALIGNMENTS: readonly ForcedAlignment[] = ['left', 'center', 'right', 'justify'];
const align = ALIGNMENTS.find((value) => value === query.get('align')) ?? 'left';
document.documentElement.dataset.forcedLines = forced ? 'on' : 'off';
document.documentElement.style.setProperty('--doc-paragraph-text-align', align);

const SCENARIOS = [
  { label: 'Cases', build: casesDocument },
  { label: 'About 40 pages', build: () => singleSectionDocument(588) },
  { label: 'About 300 pages', build: () => singleSectionDocument(4420) },
] as const;

mountStressLab({
  build: (size) => (SCENARIOS[size] ?? SCENARIOS[0]).build(),
  sizes: SCENARIOS.map(({ label }, value) => ({ label, value })),
  editor: { find: true, suggesting: query.has('suggest') },
  plugins: () =>
    forced
      ? [
          createForcedLines({
            fitWidth: inlineFitWidth(defaultWidth),
            columnWidth: defaultWidth,
            align,
            breaks: query.get('breaks') === 'widget' ? 'widget' : 'end',
          }),
        ]
      : [],
});
installForcedLinesProbe();
