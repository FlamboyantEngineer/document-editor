// The pages' text layout engine, behind the editor's `textLayout: 'pretext'` option: each block's
// height, margins and lines from the layout engine (`src/layout-engine/`), with no DOM, and the
// lines of each text block the pages draw. A block the engine cannot lay out yet is left to the
// DOM measuring, with the reason counted. Results are kept by node, so a keystroke lays out only
// the block it changed (DOCE-PAGINATION-11). This module is loaded only when the option is on.

import { type MeasureContext, setLayoutScale, setMeasureContext } from '@chenglou/pretext';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { idOf } from '../engine/footnote-model.js';
import { numberFootnoteParts } from '../engine/footnote-numbers.js';
import { createAtomCache } from '../layout-engine/atoms.js';
import { createBlockLayout } from '../layout-engine/blocks/block-layout.js';
import { blockMetrics } from '../layout-engine/blocks/metrics.js';
import { blockNumbers } from '../layout-engine/blocks/numbers.js';
import type { BlockTextLayout } from '../layout-engine/blocks/types.js';
import { createDomAtomMeasurer } from '../layout-engine/dom-atoms.js';
import { documentNumbers, type ParagraphNumber } from '../layout-engine/numbers.js';
import { REFUSED_TEXT_ATOMS, TEXT_ATOMS } from '../layout-engine/text-atoms.js';
import { createTextLayout } from '../layout-engine/text-layout.js';
import {
  findTemplateSection,
  type LayoutBlock,
  type TemplateFile,
  templatePageMetrics,
} from '../model/index.js';
import { createDrawnAtomMeasurer } from './drawn-atoms.js';
import type { DrawnLines, PagesTextEngine, TextEngineOptions } from './text-engine-types.js';

interface KeptBlock {
  readonly key: string;
  readonly block: LayoutBlock;
}

interface KeptLines {
  readonly key: string;
  readonly table: DrawnLines | null;
}

// The width of a section's page content, inside its margins.
function contentWidth(template: TemplateFile, scope: string | null): number {
  const section = findTemplateSection(template, scope);
  const { width, margins } = templatePageMetrics(template, section);
  return width - margins.left - margins.right;
}

// Each section's content width, computed once per scope.
function contentWidths(template: TemplateFile): (scope: string | null) => number {
  const widths = new Map<string | null, number>();
  return (scope) => {
    let width = widths.get(scope);
    if (width === undefined) {
      width = contentWidth(template, scope);
      widths.set(scope, width);
    }
    return width;
  };
}

// Where the engine measures its atoms: out of sight, beside the view that measures the pages, whose
// ancestors' copies the atoms are drawn in; in a page's content of its own without that view, so
// the stylesheet draws them as on the pages.
function atomHost(measureIn: HTMLElement, drawn: boolean): HTMLElement {
  const host = measureIn.ownerDocument.createElement('div');
  host.className = drawn ? 'de-atom-measure' : 'pm-page-content de-atom-measure';
  host.setAttribute('aria-hidden', 'true');
  measureIn.append(host);
  return host;
}

// The text layout block geometry reads, with each heading's number before its first line. A
// paragraph's line table is kept whole in its measurement, so it splits at a computed line start.
function numberedText(
  text: ReturnType<typeof createTextLayout>,
  numbers: () => NodeNumbers,
): BlockTextLayout {
  return {
    typography: (node, scope) => text.typography(node, scope),
    layoutText: (node, place) => {
      const { prefixes, paragraphs } = numbers();
      const prefix = place.prefix ?? prefixes.get(node);
      const number = paragraphs.get(node);
      return text.layoutText(node, { ...place, ...(prefix ? { prefix } : {}), number });
    },
  };
}

// A document's numbers by node, for the blocks laid out next.
interface NodeNumbers {
  readonly doc: ProseMirrorNode | null;
  readonly prefixes: ReadonlyMap<ProseMirrorNode, string>;
  readonly paragraphs: ReadonlyMap<ProseMirrorNode, ParagraphNumber>;
  /** A caption's label (`blockNumbers`). */
  readonly labelOf: (caption: ProseMirrorNode) => string | undefined;
  /** A footnote marker's or entry's number, by its footnote's id. */
  readonly footnoteOf: (part: ProseMirrorNode) => string | undefined;
  /** The numbers as one key, which a kept block's must match. */
  readonly keyOf: (node: ProseMirrorNode) => string;
}

const NO_NUMBERS: NodeNumbers = {
  doc: null,
  prefixes: new Map(),
  paragraphs: new Map(),
  labelOf: () => undefined,
  footnoteOf: () => undefined,
  keyOf: () => '',
};

// Each footnote's number by its id, through the document as the measuring view numbers them, and
// the numbers of the markers in each top-level block, in order, as the key a kept block's must
// match: a marker renumbered changes its width (DOCE-PAGINATION-10.7).
function footnotesOf(doc: ProseMirrorNode) {
  const byId = new Map<string, string>();
  const byBlock = new Map<ProseMirrorNode, string>();
  for (const { node, pos, number } of numberFootnoteParts(doc, 'document')) {
    const id = idOf(node);
    if (id !== null) byId.set(id, String(number));
    if (node.type.name !== 'footnote_reference') continue;
    const $pos = doc.resolve(pos);
    for (let depth = $pos.depth - 1; depth >= 0; depth -= 1) {
      if ($pos.node(depth).type.name !== 'page_content') continue;
      const block = $pos.node(depth + 1);
      byBlock.set(block, `${byBlock.get(block) ?? ''},${String(number)}`);
      break;
    }
  }
  return { byId, byBlock };
}

// The numbers of the footnote markers a text block holds, as a key.
function markerKey(node: ProseMirrorNode, footnoteOf: NodeNumbers['footnoteOf']): string {
  let key = '';
  node.forEach((child) => {
    if (child.type.name === 'footnote_reference') key += `,${footnoteOf(child) ?? ''}`;
  });
  return key;
}

function numbersByNode(doc: ProseMirrorNode, template: TemplateFile) {
  const { headings, paragraphs } = documentNumbers(doc, template);
  const prefixes = new Map<ProseMirrorNode, string>();
  const numbered = new Map<ProseMirrorNode, ParagraphNumber>();
  for (const [pos, prefix] of headings) {
    const node = doc.nodeAt(pos);
    if (node) prefixes.set(node, prefix);
  }
  for (const [pos, number] of paragraphs) {
    const node = doc.nodeAt(pos);
    if (node) numbered.set(node, number);
  }
  const labels = blockNumbers(doc, template);
  const footnotes = footnotesOf(doc);
  const footnoteOf = (part: ProseMirrorNode) => footnotes.byId.get(idOf(part) ?? '');
  const byNode: NodeNumbers = {
    doc,
    prefixes,
    paragraphs: numbered,
    labelOf: (caption) => labels.labelOf(caption),
    footnoteOf,
    keyOf: (node) =>
      `${prefixes.get(node) ?? numbered.get(node)?.label ?? ''}|${footnotes.byBlock.get(node) ?? ''}`,
  };
  const numbering = { headings, paragraphs: new Set(paragraphs.keys()) };
  return { byNode, numbering };
}

// The width source by default: a Canvas measuring unhinted, as the pages draw their text under
// `text-rendering: geometricPrecision`; hinted widths differ by script and no measurer predicts them.
function unhintedContext(): MeasureContext {
  const context = new OffscreenCanvas(1, 1).getContext('2d');
  if (!context) throw new Error('The text layout engine needs a 2D canvas context');
  context.textRendering = 'geometricPrecision';
  return context;
}

// Measures with the host's width source, or unhinted, and fits lines at a scale of 1 whatever the
// screen or zoom, so every device computes the same lines; the pages are drawn on them. The font
// metrics come from the same source, rounded at that scale too (the engine's default).
function measureIn(options: TextEngineOptions) {
  const context = options.measureContext ?? unhintedContext;
  setMeasureContext(context);
  setLayoutScale(1);
  return context;
}

// The inline atoms laid out as their text: those the pages draw as the schema does, not a host's.
function textAtomTypes(options: TextEngineOptions): ReadonlySet<string> {
  const host = new Set(options.hostViews ?? []);
  return new Set([...TEXT_ATOMS].filter((type) => !host.has(type)));
}

// Measures atoms as the pages' measuring view draws them, or, without one, in a host of its own.
function atomMeasurer(options: TextEngineOptions, host: HTMLElement) {
  const { view } = options;
  return view
    ? createDrawnAtomMeasurer({ view, host, scale: options.scale })
    : createDomAtomMeasurer({ host });
}

/** Creates the pages' text layout engine for a template. */
export function createPagesTextEngine(options: TextEngineOptions): PagesTextEngine {
  const { template } = options;
  const host = atomHost(options.measureIn, Boolean(options.view));
  const atoms = createAtomCache({ measure: atomMeasurer(options, host) });
  let numbers = NO_NUMBERS;
  const text = createTextLayout({
    template,
    measureContext: measureIn(options),
    codeLineNumbers: options.codeLineNumbers,
    reserve: options.reserve,
    measureAtom: (node, place) => atoms.measureAtom(node, place),
    textAtoms: {
      types: textAtomTypes(options),
      footnoteOf: (marker) => numbers.footnoteOf(marker),
      refused: options.refusedTextAtoms ?? REFUSED_TEXT_ATOMS,
    },
  });
  const geometry = createBlockLayout({
    text: numberedText(text, () => numbers),
    atoms,
    metrics: (scope) => blockMetrics(template, scope),
    labelOf: (caption) => numbers.labelOf(caption),
    footnoteOf: (entry) => numbers.footnoteOf(entry),
  });
  let blocks = new WeakMap<ProseMirrorNode, KeptBlock>();
  let lines = new WeakMap<ProseMirrorNode, KeptLines>();
  const counts = { laid: 0, refused: 0, reasons: new Map<string, number>() };
  const widthOf = contentWidths(template);
  const unsubscribe = atoms.subscribe(() => {
    blocks = new WeakMap();
    lines = new WeakMap();
    options.onAtomsSettled();
  });

  return {
    template,
    number(doc) {
      if (numbers.doc !== doc) numbers = numbersByNode(doc, template).byNode;
    },
    numbering: (doc) => numbersByNode(doc, template).numbering,
    measureBlock(node, scope) {
      const key = `${scope ?? ''}|${numbers.keyOf(node)}`;
      const kept = blocks.get(node);
      if (kept?.key === key) return kept.block;
      const result = geometry.layoutBlock(node, { width: widthOf(scope), scope });
      if (!result.ok) {
        counts.refused += 1;
        counts.reasons.set(result.reason, (counts.reasons.get(result.reason) ?? 0) + 1);
        return null;
      }
      counts.laid += 1;
      if (!result.provisional) blocks.set(node, { key, block: result.block });
      return result.block;
    },
    lines(node, place) {
      const markers = markerKey(node, numbers.footnoteOf);
      const key = `${place.scope ?? ''}|${place.prefix ?? ''}|${place.number?.label ?? ''}|${markers}`;
      const kept = lines.get(node);
      if (kept?.key === key) return kept.table;
      const width = widthOf(place.scope);
      const { scope, prefix, number } = place;
      const result = text.layoutText(node, { width, scope, prefix, number });
      const justify = text.typography(node, place.scope).align === 'justify';
      const table = result.ok ? { ...result.table, justify } : null;
      lines.set(node, { key, table });
      return table;
    },
    stats: () => ({ laid: counts.laid, refused: counts.refused, reasons: new Map(counts.reasons) }),
    destroy() {
      unsubscribe();
      host.remove();
    },
  };
}
