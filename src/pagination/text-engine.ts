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
import { hiddenSuggestion } from '../layout-engine/hidden-suggestions.js';
import { createTextLayout, type TextLayout } from '../layout-engine/text-layout.js';
import { documentLanguage } from '../model/index.js';
import { bodyVariablesKey, bodyVariablesOf } from './body-variables.js';
import { contentWidths } from './content-width.js';
import { drawnContents } from './contents-drawn.js';
import { type ContentsLists, createContentsLists } from './contents-lists.js';
import { hostRuleSizes, sizedReading, textAtomsOf, watchedRules } from './host-rules.js';
import { type InsertedTexts, NO_INSERTED } from './inserted-texts.js';
import { engineSources } from './layout-inputs.js';
import { createNestedLines, type LinesRecorder } from './nested-lines.js';
import { holdNodeNumbers, type NodeNumbers } from './node-numbers.js';
import { numberedText } from './numbered-text.js';
import { createObjectRecorder } from './object-recorder.js';
import { createRegionLines } from './region-lines.js';
import {
  atomMeasurer,
  documentMathPending,
  mathPlaces,
  provisionalMath,
} from './text-engine-atoms.js';
import { createCounts, createRefusals, unsized } from './text-engine-counts.js';
import { keptBlocks, keptLines } from './text-engine-kept.js';
import type { PagesTextEngine, TextEngineOptions } from './text-engine-types.js';

/** What the engine's layouts read and tell. */
interface LayoutInputs {
  readonly numbers: () => NodeNumbers;
  readonly inserted: () => InsertedTexts;
  readonly recorder: LinesRecorder;
  readonly contents: ContentsLists;
  /** Told of each node that cannot be laid out, which takes no room. */
  readonly refused: (node: ProseMirrorNode, reason: string) => void;
  /** Told of each atom given a provisional size (DOCE-PAGINATION-12.13). */
  readonly provisional: (node: ProseMirrorNode) => void;
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
  { numbers, inserted, recorder, contents, refused, provisional }: LayoutInputs,
) {
  // What the body text's variables show, and the key a kept layout of a block holding some matches.
  const body = bodyVariablesOf(numbers, contents);
  const variablesKey = (node: ProseMirrorNode) => bodyVariablesKey(node, body);
  const { template } = options;
  const measureContext = options.measureContext ?? unhintedContext;
  const select = measuringWith(measureContext);
  select();
  const equationOf = (equation: ProseMirrorNode) => numbers().equationOf(equation);
  const math = mathPlaces(equationOf);
  // The text layout is made after the atom cache it measures atoms with.
  let laying: TextLayout | null = null;
  const textNow = () => {
    if (!laying) throw new Error('The text layout is not made yet');
    return laying;
  };
  const typography = () => textNow().typography;
  const atoms = createAtomCache({ measure: atomMeasurer(options, { typography }), provisional });
  // The nodes the layout rules size, before the engine's own sizes.
  const sizes = hostRuleSizes(options, textNow);
  const text = createTextLayout({
    template,
    hidden: () => hiddenSuggestion(options.markup?.() ?? 'all'),
    bodyVariables: body,
    measureContext,
    isFontServed: options.isFontServed,
    codeLineNumbers: options.codeLineNumbers,
    language: options.language ?? documentLanguage(null, template),
    reserve: options.reserve,
    // An inline atom nothing sizes, such as kept content the schema does not know, takes no room.
    measureAtom: (node, place) =>
      sizes.inline(node, place?.width ?? 0, place?.scope ?? null) ??
      atoms.measureAtom(node, place) ??
      unsized(node, refused),
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
    onRefused: refused,
  });
  laying = text;
  const labelOf = (caption: ProseMirrorNode) => numbers().labelOf(caption);
  return {
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

/** Creates the pages' text layout engine for a template. */
export function createPagesTextEngine(options: TextEngineOptions): PagesTextEngine {
  const { template, markup } = options;
  const numbers = holdNodeNumbers(template);
  // The words inserted in the blocks being measured.
  let current = NO_INSERTED;
  const recorder: LinesRecorder = { lines: null };
  const contents = createContentsLists(template, options.view);
  const refusals = createRefusals();
  const waiting = provisionalMath(options);
  const layouts = engineLayouts(options, {
    numbers: numbers.current,
    inserted: () => current,
    recorder,
    contents,
    refused: refusals.refuse,
    provisional: waiting.note,
  });
  const { text, geometry, select, measureContext, variablesKey, labelOf } = layouts;
  const counts = createCounts(layouts.sizes.errors, refusals);
  const rules = watchedRules(options, () => forget());
  const widthOf = contentWidths(template);
  const keyed = { widthOf, markup, numbers: numbers.current, variablesKey };
  const tables = keptLines(text, { ...keyed, provisional: waiting.count });
  const blocks = keptBlocks({
    ...keyed,
    provisional: waiting.count,
    geometry,
    contents,
    hostViews: rules.hostViews,
    refuse: refusals.refuse,
    laid: counts.laid,
    inserting: (words) => {
      current = words;
    },
  });
  const footnoteOf = (part: ProseMirrorNode) => numbers.current().footnoteOf(part);
  const laying = { geometry, recorder, widthOf, footnoteOf, markup, variablesKey, labelOf };
  const [nested, regions] = [createNestedLines(laying), createRegionLines(laying)];
  // Forgets every layout kept, as when atoms settle or the host's rules size nodes otherwise.
  const forget = () => {
    for (const kept of [blocks, tables, regions, nested]) kept.forget();
  };
  return {
    ...engineSources(options),
    number: numbers.number,
    numbersVersion: numbers.version,
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
    measureBlock: selecting(select, (node, scope, inserted = NO_INSERTED) =>
      blocks.measure(node, scope, inserted),
    ),
    insertedReserved: (node, scope, word) => text.insertedReserved(node, scope, word),
    measureRegion: selecting(select, (...at) => regions.lay(...at).room),
    regionLines: selecting(select, (...at) => regions.lay(...at).lines),
    lines: selecting(select, (node, place) => tables.lines(node, place)),
    nestedLines: selecting(select, (...at) => nested.lines(...at)),
    objectBoxes: selecting(select, layouts.objectBoxes(widthOf)),
    mathPending: (doc) => documentMathPending(options, doc),
    // Blocks and lines with provisional math are never kept; regions and containers are laid out
    // again once it settles.
    atomsVersion: () =>
      waiting.version(() => {
        for (const kept of [regions, nested]) kept.forget();
      }),
    ...layouts.math.reading(counts.stats, () => numbers.current().doc),
    ...sizedReading(layouts.sizes),
    destroy() {
      if (measuring === measureContext) measuring = null;
    },
  };
}
