// The pages' text layout engine: each block's height, margins and lines from the layout engine
// (`src/layout-engine/`), with no DOM, and the lines of each text block the pages draw. Results are
// kept by node, so a keystroke lays out only the block it changed (DOCE-PAGINATION-11).

import {
  clearCache,
  type MeasureContext,
  setEngine,
  setLayoutScale,
  setMeasureContext,
} from '@chenglou/pretext';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { createAtomCache } from '../layout-engine/atoms.js';
import { createBlockLayout } from '../layout-engine/blocks/block-layout.js';
import { blockMetrics } from '../layout-engine/blocks/metrics.js';
import type { BlockLayout, ObjectBox } from '../layout-engine/blocks/types.js';
import { hiddenSuggestion } from '../layout-engine/hidden-suggestions.js';
import { selectTextLanguage } from '../layout-engine/lines.js';
import { createTextLayout, type TextLayout } from '../layout-engine/text-layout.js';
import { documentLanguage, type LayoutBlock } from '../model/index.js';
import { bodyVariablesKey, bodyVariablesOf } from './body-variables.js';
import { contentWidths } from './content-width.js';
import { drawnContents } from './contents-drawn.js';
import { type ContentsLists, createContentsLists } from './contents-lists.js';
import { hostRuleSizes, sizedReading, textAtomsOf, watchedRules } from './host-rules.js';
import { holdInsertedTexts, NO_INSERTED } from './inserted-texts.js';
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
  readonly words: ReturnType<typeof holdInsertedTexts>;
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

// Pretext shares its settings across a module. Each editor selects its own widths and language
// before laying anything out, including widths measured before the first line is prepared.
let measuring: (() => MeasureContext) | null = null;

// Pages use Blink's line breaking at scale 1 on every device (DOCE-PAGINATION-11.1).
function measuringWith(context: () => MeasureContext, language: string) {
  return () => {
    if (!measuring) setEngine('blink');
    if (measuring !== context) {
      setMeasureContext(context);
      setLayoutScale(1);
      measuring = context;
    }
    selectTextLanguage(language);
  };
}

/** Forgets the widths the layout engine measured, as after font faces load. */
export function forgetFontWidths(): void {
  clearCache();
}

// The text layout and block geometry the engine lays out with, reading the document's numbers.
function engineLayouts(
  options: TextEngineOptions,
  { numbers, words, recorder, contents, refused, provisional }: LayoutInputs,
) {
  // What the body text's variables show, and the key a kept layout of a block holding some matches.
  const body = bodyVariablesOf(numbers, contents);
  const variablesKey = (node: ProseMirrorNode) => bodyVariablesKey(node, body);
  const { template, language = documentLanguage(null, options.template) } = options;
  const measureContext = options.measureContext ?? unhintedContext;
  const select = measuringWith(measureContext, language);
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
  const sizes = hostRuleSizes(options, textNow, language);
  const text = createTextLayout({
    template,
    hidden: () => hiddenSuggestion(options.markup?.() ?? 'all'),
    bodyVariables: body,
    measureContext,
    isFontServed: options.isFontServed,
    codeLineNumbers: options.codeLineNumbers,
    language,
    reserve: options.reserve,
    sizeAtom: (node, place) => sizes.inline(node, place.width ?? 0, place.scope ?? null),
    // An inline atom nothing sizes, such as kept content the schema does not know, takes no room.
    measureAtom: (node, place) => atoms.measureAtom(node, place) ?? unsized(node, refused),
    onMath: math.record,
    textAtoms: textAtomsOf(options, numbers),
  });
  const objects = createObjectRecorder();
  const geometry = createBlockLayout({
    text: numberedText(text, { numbers, inserted: words.current, recorder }),
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
  return {
    text,
    geometry,
    // Block geometry that records each layout's figure and table boxes, kept with its block.
    recording: recordingBoxes(geometry, objects),
    select,
    measureContext,
    variablesKey,
    labelOf: (caption: ProseMirrorNode) => numbers().labelOf(caption),
    math,
    sizes,
  };
}

/** No figure or table boxes. */
const NO_BOXES: ReadonlyMap<ProseMirrorNode, ObjectBox> = new Map();

// Block geometry whose block layouts keep the figure and table boxes they were laid out with, so a
// resize reads the layout the pages were laid out with and never lays the block out again
// (DOCE-PAGINATION-10.12). Only a block holding one keeps any.
function recordingBoxes(geometry: BlockLayout, objects: ReturnType<typeof createObjectRecorder>) {
  const kept = new WeakMap<LayoutBlock, ReadonlyMap<ProseMirrorNode, ObjectBox>>();
  const recording: BlockLayout = {
    layoutRegion: (node, place, entry) => geometry.layoutRegion(node, place, entry),
    layoutBlock(node, place) {
      const { laid, boxes } = objects.boxesOf(() => geometry.layoutBlock(node, place));
      if (laid.ok && boxes.size) kept.set(laid.block, boxes);
      return laid;
    },
  };
  return {
    geometry: recording,
    boxesOf: (block: LayoutBlock) => kept.get(block) ?? NO_BOXES,
  };
}

// The figure and table boxes and a list of contents' rows, read from the block layout the engine
// kept, the one the pages were laid out with (DOCE-PAGINATION-10.11, 10.12).
function keptReadings(
  blocks: ReturnType<typeof keptBlocks>,
  layouts: ReturnType<typeof engineLayouts>,
  {
    contents,
    numbers,
    select,
  }: {
    contents: ContentsLists;
    numbers: () => NodeNumbers;
    select: () => void;
  },
): Pick<PagesTextEngine, 'contentsDrawn' | 'objectBoxes'> {
  return {
    objectBoxes: selecting(select, (block, scope, inserted = NO_INSERTED) =>
      layouts.recording.boxesOf(blocks.measure(block, scope, inserted)),
    ),
    contentsDrawn: selecting(select, (node, scope, inserted = NO_INSERTED) =>
      drawnContents(node, {
        scope,
        block: blocks.measure(node, scope, inserted),
        text: layouts.text,
        contents,
        doc: numbers().doc,
      }),
    ),
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

// The line and object readers share the same measurements and current rules as full layouts.
function cachedDrawings(
  layouts: ReturnType<typeof engineLayouts>,
  inputs: Parameters<typeof keptLines>[1] & {
    recorder: LinesRecorder;
    words: ReturnType<typeof holdInsertedTexts>;
    select: () => void;
  },
) {
  const { text, geometry, labelOf, sizes } = layouts;
  const { numbers, select } = inputs;
  const footnoteOf = (part: ProseMirrorNode) => numbers().footnoteOf(part);
  const place = { ...inputs, geometry, labelOf, footnoteOf };
  const tables = keptLines(text, inputs);
  const nested = createNestedLines(place);
  const regions = createRegionLines(place);
  const forgetRegions = () => {
    regions.forget();
    nested.forget();
  };
  const reading: Pick<
    PagesTextEngine,
    'insertedReserved' | 'measureRegion' | 'regionLines' | 'lines' | 'nestedLines'
  > = {
    insertedReserved: text.insertedReserved,
    measureRegion: selecting(select, (...at) => regions.lay(...at).room),
    regionLines: selecting(select, (...at) => regions.lay(...at).lines),
    lines: selecting(select, (node, place) =>
      sizes.sizes(node) ? null : tables.lines(node, place),
    ),
    nestedLines: selecting(select, (...at) => nested.lines(...at)),
  };
  return {
    reading,
    forgetRegions,
    forget() {
      tables.forget();
      forgetRegions();
    },
  };
}

/** Creates the pages' text layout engine for a template. */
export function createPagesTextEngine(options: TextEngineOptions): PagesTextEngine {
  const { template } = options;
  const numbers = holdNodeNumbers(template);
  const words = holdInsertedTexts();
  const recorder: LinesRecorder = { lines: null };
  const contents = createContentsLists(template, options.state);
  const refusals = createRefusals();
  const waiting = provisionalMath(options);
  const layouts = engineLayouts(options, {
    numbers: numbers.current,
    words,
    recorder,
    contents,
    refused: refusals.refuse,
    provisional: waiting.note,
  });
  const { select: selectPretext, measureContext, variablesKey } = layouts;
  // The errors of the nodes of the document numbered last, the one being laid out.
  const counts = createCounts(
    () => layouts.sizes.errors(numbers.current().doc ?? undefined),
    refusals,
  );
  const rules = watchedRules(options, () => forget());
  const select = () => {
    rules.refresh();
    selectPretext();
  };
  const widthOf = contentWidths(template);
  const keyed = {
    widthOf,
    markupKey: rules.markupKey,
    numbers: numbers.current,
    variablesKey,
    provisional: waiting.count,
  };
  const drawings = cachedDrawings(layouts, { ...keyed, recorder, words, select });
  const blocks = keptBlocks({
    ...keyed,
    geometry: layouts.recording.geometry,
    contents,
    hostViews: rules.hostViews,
    refuse: refusals.refuse,
    laid: counts.laid,
    withInserted: words.with,
  });
  const forget = () => {
    blocks.forget();
    drawings.forget();
  };
  return {
    ...engineSources(options),
    number(doc, footnoteNumbering) {
      numbers.number(doc, footnoteNumbering);
      layouts.math.number(doc);
    },
    numbersVersion: numbers.version,
    numbering: numbers.numbering,
    pageDigits: (count) => contents.pageDigits(count),
    contentsKeyOf: (node) => contents.keyOf(node, numbers.current().doc),
    ...drawings.reading,
    measureBlock: selecting(select, (node, scope, inserted = NO_INSERTED) =>
      blocks.measure(node, scope, inserted),
    ),
    ...keptReadings(blocks, layouts, { contents, numbers: numbers.current, select }),
    mathPending: (doc) => documentMathPending(options, doc),
    // Blocks and lines with provisional math are never kept. Regions and containers are laid out
    // again once it settles.
    atomsVersion: () => waiting.version(drawings.forgetRegions),
    hiddenSuggestion: () => hiddenSuggestion(options.markup?.() ?? 'all'),
    ...layouts.math.reading(counts.stats),
    ...sizedReading(layouts.sizes),
    destroy() {
      layouts.math.forget();
      if (measuring === measureContext) measuring = null;
    },
  };
}
