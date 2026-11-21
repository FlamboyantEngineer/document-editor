// The forced-lines spike (Pretext plan, thread P): the document editor on pages, its top-level
// paragraphs and headings drawn on the lines Pretext computed. `?forced=off` draws the same
// document with the browser's own line breaks; `?align=` aligns every forced block; `?suggest`
// types as suggestions; `?breaks=widget` ends lines with the break widgets tried first; `?direct`
// draws the lines on the pages' own view; `?skip` lets pages off screen skip
// their layout (content-visibility); `?limit=` forces only that many blocks when the document
// opens (a timing experiment).

import { casesDocument, singleSectionDocument } from './spikes/forced-lines/documents.js';
import { drawForcedLinesDirectly } from './spikes/forced-lines/direct.js';
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
if (query.has('skip')) document.documentElement.dataset.skipPages = '';

const SCENARIOS = [
  { label: 'Cases', build: casesDocument },
  { label: 'About 40 pages', build: () => singleSectionDocument(588) },
  { label: 'About 300 pages', build: () => singleSectionDocument(4420) },
] as const;

const options = {
  fitWidth: inlineFitWidth(defaultWidth),
  columnWidth: defaultWidth,
  align,
  breaks: query.get('breaks') === 'widget' ? ('widget' as const) : ('end' as const),
  limit: query.has('limit') ? Number(query.get('limit')) : undefined,
};
// `?direct` draws the lines on the pages' own view rather than as canonical decorations.
const direct = forced && query.has('direct');
if (direct) drawForcedLinesDirectly(options);

mountStressLab({
  build: (size) => (SCENARIOS[size] ?? SCENARIOS[0]).build(),
  sizes: SCENARIOS.map(({ label }, value) => ({ label, value })),
  editor: { find: true, suggesting: query.has('suggest') },
  plugins: () => (forced && !direct ? [createForcedLines(options)] : []),
});
installForcedLinesProbe();
