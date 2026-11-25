// The pages' text layout engine: each block's height, margins and lines from the layout engine
// (`src/layout-engine/`), with no DOM, and the lines of each text block the pages draw. Results are
// kept by node, so a keystroke lays out only the block it changed (DOCE-PAGINATION-11).

import {
  clearCache,
  type MeasureContext,
  setLayoutScale,
  setMeasureContext,
} from '@chenglou/pretext';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { createAtomCache } from '../layout-engine/atoms.js';
import { createBlockLayout } from '../layout-engine/blocks/block-layout.js';
import { blockMetrics } from '../layout-engine/blocks/metrics.js';
import { hiddenSuggestion, suggestionKey } from '../layout-engine/hidden-suggestions.js';
import { insertedKey } from '../layout-engine/inserted-text.js';
import { createTextLayout, type TextLayout } from '../layout-engine/text-layout.js';
import type { LayoutBlock } from '../model/index.js';
import { bodyVariablesKey, bodyVariablesOf } from './body-variables.js';
import { contentWidths } from './content-width.js';
import { drawnContents } from './contents-drawn.js';
import { type ContentsLists, createContentsLists } from './contents-lists.js';
import { hostRuleSizes, refusedAsDrawn, textAtomsOf, watchedRules } from './host-rules.js';
import { blockInsertedKey, type InsertedTexts, NO_INSERTED } from './inserted-texts.js';
import { engineSources } from './layout-inputs.js';
import { createNestedLines, type LinesRecorder } from './nested-lines.js';
import { holdNodeNumbers, markerKey, type NodeNumbers } from './node-numbers.js';
import { numberedText } from './numbered-text.js';
import { createObjectRecorder } from './object-recorder.js';
import { createRegionLines } from './region-lines.js';
import { atomMeasurer, mathPlaces } from './text-engine-atoms.js';
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

// The text layout and block geometry the engine lays out with, reading the document's numbers.
function engineLayouts(
  options: TextEngineOptions,
  {
    numbers,
    inserted,
    recorder,
    contents,
  }: {
    numbers: () => NodeNumbers;
    inserted: () => InsertedTexts;
    recorder: LinesRecorder;
    contents: ContentsLists;
  },
) {
  // What the body text's variables show, and the key a kept layout of a block holding some matches.
  const body = bodyVariablesOf(options.variables, () => contents.digits());
  const variablesKey = (node: ProseMirrorNode) => bodyVariablesKey(node, body);
  const { template } = options;
  const measureContext = options.measureContext ?? unhintedContext;
  const select = measuringWith(measureContext);
  select();
  const host = atomHost(options.measureIn, Boolean(options.view));
  const equationOf = (equation: ProseMirrorNode) => numbers().equationOf(equation);
  const math = mathPlaces(equationOf);
  // The text layout is made after the atom cache it measures atoms with.
  let laying: TextLayout | null = null;
  const textNow = () => {
    if (!laying) throw new Error('The text layout is not made yet');
    return laying;
  };
  const typography = () => textNow().typography;
  const atoms = createAtomCache({ measure: atomMeasurer(options, { host, typography }) });
  // The host's nodes its layout rules size, before anything measures them as drawn.
  const sizes = hostRuleSizes(options, textNow);
  const text = createTextLayout({
    template,
    hidden: () => hiddenSuggestion(options.markup?.() ?? 'all'),
    bodyVariables: body,
    measureContext,
    isFontServed: options.isFontServed,
    codeLineNumbers: options.codeLineNumbers,
    language: options.language ?? '',
    reserve: options.reserve,
    measureAtom: (node, place) =>
      sizes.inline(node, place?.width ?? 0, place?.scope ?? null) ?? atoms.measureAtom(node, place),
    onMath: math.record,
    textAtoms: textAtomsOf(options, numbers),
  });
  const objects = createObjectRecorder();
  const geometry = createBlockLayout({
    text: numberedText(text, { numbers, inserted, recorder }),
    atoms,
    metrics: (scope) => blockMetrics(template, scope),
    labelOf: (caption) => (recorder.labelOf ?? numbers().labelOf)(caption),
    footnoteOf: (entry) => numbers().footnoteOf(entry),
    equationOf,
    contentsOf: (node) => contents.of(node, numbers().doc),
    pageDigits: () => contents.digits(),
    onMath: math.record,
    onObject: objects.record,
    ruleSizes: sizes,
  });
  laying = text;
  atoms.subscribe(math.forget);
  const labelOf = (caption: ProseMirrorNode) => numbers().labelOf(caption);
  return {
    host,
    atoms,
    text,
    geometry,
    // The figure and table boxes of a top-level block laid out in its section's content width.
    objectBoxes:
      (widthOf: (scope: string | null) => number) =>
      (block: ProseMirrorNode, scope: string | null) =>
        objects.boxesOf(() => geometry.layoutBlock(block, { width: widthOf(scope), scope })),
    select,
    measureContext,
    variablesKey,
    labelOf,
    math,
    sizes,
  };
}

// A way into the engine that measures, setting Pretext's width source to the engine's own first
// (DOCE-PAGINATION-12.6).
function selecting<Args extends unknown[], Result>(
  select: () => void,
  measure: (...args: Args) => Result,
): (...args: Args) => Result {
  return (...args) => {
    select();
    return measure(...args);
  };
}

// Each text block's lines as the pages draw them, kept by node until what they depend on changes.
function keptLines(
  text: ReturnType<typeof createTextLayout>,
  {
    widthOf,
    numbers,
    markup,
    variablesKey,
  }: {
    widthOf: (scope: string | null) => number;
    numbers: () => NodeNumbers;
    markup: TextEngineOptions['markup'];
    variablesKey: (node: ProseMirrorNode) => string;
  },
) {
  let kept = new WeakMap<ProseMirrorNode, KeptLines>();
  return {
    forget() {
      kept = new WeakMap();
    },
    lines(node: ProseMirrorNode, place: Parameters<PagesTextEngine['lines']>[1]) {
      const markers = markerKey(node, numbers().footnoteOf);
      const words = insertedKey(place.inserted);
      const key = `${place.scope ?? ''}|${place.prefix ?? ''}|${place.number?.label ?? ''}|${markers}|${words}|${suggestionKey(node, markup)}${variablesKey(node)}`;
      const found = kept.get(node);
      if (found?.key === key) return found.table;
      const width = widthOf(place.scope);
      const { scope, prefix, number, inserted } = place;
      const result = text.layoutText(node, { width, scope, prefix, number, inserted });
      const justify = text.typography(node, place.scope).align === 'justify';
      const table = result.ok ? { ...result.table, justify } : null;
      kept.set(node, { key, table });
      return table;
    },
  };
}

/** Creates the pages' text layout engine for a template. */
export function createPagesTextEngine(options: TextEngineOptions): PagesTextEngine {
  const { template, markup } = options;
  const numbers = holdNodeNumbers(template);
  // The words inserted in the blocks being measured.
  let current = NO_INSERTED;
  const recorder: LinesRecorder = { lines: null };
  const contents = createContentsLists(template, options.view);
  const layouts = engineLayouts(options, {
    numbers: numbers.current,
    inserted: () => current,
    recorder,
    contents,
  });
  const { host, atoms, text, geometry, select, measureContext, variablesKey, labelOf } = layouts;
  let blocks = new WeakMap<ProseMirrorNode, KeptBlock>();
  const counts = createCounts(layouts.sizes.errors);
  const rules = watchedRules(options, () => forget());
  const widthOf = contentWidths(template);
  const tables = keptLines(text, { widthOf, markup, numbers: numbers.current, variablesKey });
  const footnoteOf = (part: ProseMirrorNode) => numbers.current().footnoteOf(part);
  const laying = { geometry, recorder, widthOf, footnoteOf, markup, variablesKey, labelOf };
  const [nested, regions] = [createNestedLines(laying), createRegionLines(laying)];
  // Forgets every layout kept, as when atoms settle or the host's rules size nodes otherwise.
  const forget = () => {
    blocks = new WeakMap();
    for (const kept of [tables, regions, nested]) kept.forget();
  };
  const unsubscribe = atoms.subscribe(() => [forget(), options.onAtomsSettled()]);
  return {
    ...engineSources(options),
    number: numbers.number,
    numbering: numbers.numbering,
    pageDigits: (count) => contents.pageDigits(count),
    contentsDrawn: selecting(select, (node, scope) =>
      drawnContents(node, {
        scope,
        geometry,
        text,
        contents,
        width: widthOf(scope),
        doc: numbers.current().doc,
      }),
    ),
    measureBlock(node, scope, inserted = NO_INSERTED) {
      select();
      const refusal = refusedAsDrawn(node, inserted, rules.hostViews());
      if (refusal) {
        counts.refuse(refusal);
        return null;
      }
      const listed = contents.keyOf(node, numbers.current().doc) + variablesKey(node);
      const key = `${scope ?? ''}|${numbers.current().keyOf(node)}|${blockInsertedKey(node, inserted)}|${suggestionKey(node, options.markup)}${listed}`;
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
    measureRegion: selecting(select, (...at) => regions.lay(...at).room),
    regionLines: selecting(select, (...at) => regions.lay(...at).lines),
    lines: selecting(select, (node, place) => tables.lines(node, place)),
    nestedLines: selecting(select, (...at) => nested.lines(...at)),
    objectBoxes: selecting(select, layouts.objectBoxes(widthOf)),
    provisional: atoms.pending,
    ...layouts.math.reading(counts.stats, () => numbers.current().doc),
    destroy() {
      unsubscribe();
      host.remove();
      if (measuring === measureContext) measuring = null;
    },
  };
}
