// The pages' text layout engine, behind the editor's `textLayout: 'pretext'` option: each block's
// height, margins and lines from the layout engine (`src/layout-engine/`), with no DOM, and the
// lines of each text block the pages draw. A block the engine cannot lay out yet is left to the
// DOM measuring, with the reason counted. Results are kept by node, so a keystroke lays out only
// the block it changed (DOCE-PAGINATION-11). This module is loaded only when the option is on.

import {
  clearCache,
  type MeasureContext,
  setLayoutScale,
  setMeasureContext,
} from '@chenglou/pretext';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { idOf } from '../engine/footnote-model.js';
import { numberFootnoteParts } from '../engine/footnote-numbers.js';
import { createAtomCache } from '../layout-engine/atoms.js';
import { createBlockLayout } from '../layout-engine/blocks/block-layout.js';
import { blockMetrics } from '../layout-engine/blocks/metrics.js';
import { blockNumbers } from '../layout-engine/blocks/numbers.js';
import { readSheetNumbers } from '../layout-engine/blocks/sheet-numbers.js';
import { createDomAtomMeasurer } from '../layout-engine/dom-atoms.js';
import { insertedKey } from '../layout-engine/inserted-text.js';
import { documentNumbers, type ParagraphNumber } from '../layout-engine/numbers.js';
import { REFUSED_TEXT_ATOMS, TEXT_ATOMS } from '../layout-engine/text-atoms.js';
import { createTextLayout } from '../layout-engine/text-layout.js';
import {
  findTemplateSection,
  type LayoutBlock,
  type TemplateFile,
  templatePageMetrics,
} from '../model/index.js';
import { captionLabelKeys } from './caption-label-keys.js';
import { createDrawnAtomMeasurer } from './drawn-atoms.js';
import { blockInsertedKey, type InsertedTexts, NO_INSERTED } from './inserted-texts.js';
import { createNestedLines, type LinesRecorder } from './nested-lines.js';
import { numberedText } from './numbered-text.js';
import { createRegionLines } from './region-lines.js';
import { createCounts } from './text-engine-counts.js';
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
  // Read when a block is laid out, not for the numbering the pages draw on every change.
  let captions: ReadonlyMap<ProseMirrorNode, string> | null = null;
  const captionKey = (node: ProseMirrorNode) =>
    (captions ??= captionLabelKeys(doc, (caption) => labels.labelOf(caption))).get(node) ?? '';
  const byNode: NodeNumbers = {
    doc,
    prefixes,
    paragraphs: numbered,
    labelOf: (caption) => labels.labelOf(caption),
    footnoteOf,
    keyOf: (node) =>
      `${prefixes.get(node) ?? numbered.get(node)?.label ?? ''}|${footnotes.byBlock.get(node) ?? ''}|${captionKey(node)}`,
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

// The width source Pretext measures with now. Pretext keeps one for the whole page, so each engine
// sets its own before it lays out, and two editors with different fonts never share widths
// (DOCE-PAGINATION-12).
let measuring: (() => MeasureContext) | null = null;

// Measures with the host's width source, or unhinted, and fits lines at a scale of 1 whatever the
// screen or zoom, so every device computes the same lines; the pages are drawn on them. The font
// metrics come from the same source, rounded at that scale too (the engine's default).
function measuringWith(context: () => MeasureContext) {
  return () => {
    if (measuring === context) return;
    measuring = context;
    setMeasureContext(context);
    setLayoutScale(1);
  };
}

/** Forgets the widths the layout engine measured, as after font faces load. */
export function forgetFontWidths(): void {
  clearCache();
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

// The text layout and block geometry the engine lays out with, reading the document's numbers.
function engineLayouts(
  options: TextEngineOptions,
  {
    numbers,
    inserted,
    recorder,
  }: { numbers: () => NodeNumbers; inserted: () => InsertedTexts; recorder: LinesRecorder },
) {
  const { template } = options;
  const measureContext = options.measureContext ?? unhintedContext;
  const select = measuringWith(measureContext);
  select();
  const host = atomHost(options.measureIn, Boolean(options.view));
  const atoms = createAtomCache({ measure: atomMeasurer(options, host) });
  // The stylesheet's own block numbers, read where the pages' content is drawn.
  const sheet = readSheetNumbers(host);
  const text = createTextLayout({
    template,
    measureContext,
    isFontServed: options.isFontServed,
    codeLineNumbers: options.codeLineNumbers,
    language: options.language ?? '',
    reserve: options.reserve,
    measureAtom: (node, place) => atoms.measureAtom(node, place),
    textAtoms: {
      types: textAtomTypes(options),
      footnoteOf: (marker) => numbers().footnoteOf(marker),
      refused: options.refusedTextAtoms ?? REFUSED_TEXT_ATOMS,
    },
  });
  const geometry = createBlockLayout({
    text: numberedText(text, { numbers, inserted, recorder }),
    atoms,
    metrics: (scope) => blockMetrics(template, scope, sheet),
    labelOf: (caption) => numbers().labelOf(caption),
    footnoteOf: (entry) => numbers().footnoteOf(entry),
  });
  return { host, atoms, text, geometry, select, measureContext };
}

/** Creates the pages' text layout engine for a template. */
export function createPagesTextEngine(options: TextEngineOptions): PagesTextEngine {
  const { template } = options;
  let numbers = NO_NUMBERS;
  // The words inserted in the blocks being measured.
  let current = NO_INSERTED;
  const recorder: LinesRecorder = { lines: null };
  const { host, atoms, text, geometry, select, measureContext } = engineLayouts(options, {
    numbers: () => numbers,
    inserted: () => current,
    recorder,
  });
  let blocks = new WeakMap<ProseMirrorNode, KeptBlock>();
  let lines = new WeakMap<ProseMirrorNode, KeptLines>();
  const counts = createCounts();
  const widthOf = contentWidths(template);
  const nested = createNestedLines({ geometry, recorder, widthOf });
  const regions = createRegionLines({ geometry, recorder, widthOf });
  const unsubscribe = atoms.subscribe(() => {
    blocks = new WeakMap();
    lines = new WeakMap();
    regions.forget();
    nested.forget();
    options.onAtomsSettled();
  });

  return {
    template,
    fonts: options.fonts,
    number(doc) {
      if (numbers.doc !== doc) numbers = numbersByNode(doc, template).byNode;
    },
    numbering: (doc) => numbersByNode(doc, template).numbering,
    measureBlock(node, scope, inserted = NO_INSERTED) {
      select();
      // Words inserted outside a text block take room the engine cannot lay out.
      if (inserted.outside.has(node)) {
        counts.refuse('inserted words outside a text block');
        return null;
      }
      const key = `${scope ?? ''}|${numbers.keyOf(node)}|${blockInsertedKey(node, inserted)}`;
      const kept = blocks.get(node);
      if (kept?.key === key) return kept.block;
      current = inserted;
      const result = geometry.layoutBlock(node, { width: widthOf(scope), scope });
      current = NO_INSERTED;
      if (!result.ok) {
        counts.refuse(result.reason);
        return null;
      }
      counts.laid();
      if (!result.provisional) blocks.set(node, { key, block: result.block });
      return result.block;
    },
    insertedReserved: (node, scope, word) => text.insertedReserved(node, scope, word),
    measureRegion(node, scope, variables) {
      select();
      return regions.lay(node, scope, variables).room;
    },
    lines(node, place) {
      select();
      const markers = markerKey(node, numbers.footnoteOf);
      const words = insertedKey(place.inserted);
      const key = `${place.scope ?? ''}|${place.prefix ?? ''}|${place.number?.label ?? ''}|${markers}|${words}`;
      const kept = lines.get(node);
      if (kept?.key === key) return kept.table;
      const width = widthOf(place.scope);
      const { scope, prefix, number, inserted } = place;
      const result = text.layoutText(node, { width, scope, prefix, number, inserted });
      const justify = text.typography(node, place.scope).align === 'justify';
      const table = result.ok ? { ...result.table, justify } : null;
      lines.set(node, { key, table });
      return table;
    },
    nestedLines(container, scope) {
      select();
      return nested.lines(container, { scope, footnoteOf: numbers.footnoteOf });
    },
    provisional: atoms.pending,
    stats: counts.stats,
    destroy() {
      unsubscribe();
      host.remove();
      if (measuring === measureContext) measuring = null;
    },
  };
}
