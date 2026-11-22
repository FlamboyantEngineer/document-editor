// The pages' text layout engine, behind the editor's `textLayout: 'pretext'` option: each block's
// height, margins and lines from the layout engine (`src/layout-engine/`), with no DOM, and the
// lines of each text block the pages draw. A block the engine cannot lay out yet is left to the
// DOM measuring, with the reason counted. Results are kept by node, so a keystroke lays out only
// the block it changed (DOCE-PAGINATION-11). This module is loaded only when the option is on.

import { type MeasureContext, setLayoutScale, setMeasureContext } from '@chenglou/pretext';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { createAtomCache } from '../layout-engine/atoms.js';
import { createBlockLayout } from '../layout-engine/blocks/block-layout.js';
import { blockMetrics } from '../layout-engine/blocks/metrics.js';
import type { BlockTextLayout } from '../layout-engine/blocks/types.js';
import { createDomAtomMeasurer } from '../layout-engine/dom-atoms.js';
import { documentNumbers, type ParagraphNumber } from '../layout-engine/numbers.js';
import { createTextLayout } from '../layout-engine/text-layout.js';
import {
  findTemplateSection,
  type LayoutBlock,
  type TemplateFile,
  templatePageMetrics,
} from '../model/index.js';
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

// Where the engine measures its atoms: out of sight, in a page's content, so the stylesheet draws
// them as on the pages.
function atomHost(measureIn: HTMLElement): HTMLElement {
  const host = measureIn.ownerDocument.createElement('div');
  host.className = 'pm-page-content de-atom-measure';
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
  readonly prefixes: ReadonlyMap<ProseMirrorNode, string>;
  readonly paragraphs: ReadonlyMap<ProseMirrorNode, ParagraphNumber>;
  /** The numbers as one key, which a kept block's must match. */
  readonly keyOf: (node: ProseMirrorNode) => string;
}

const NO_NUMBERS: NodeNumbers = { prefixes: new Map(), paragraphs: new Map(), keyOf: () => '' };

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
  const byNode: NodeNumbers = {
    prefixes,
    paragraphs: numbered,
    keyOf: (node) => prefixes.get(node) ?? numbered.get(node)?.label ?? '',
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

/** Creates the pages' text layout engine for a template. */
export function createPagesTextEngine(options: TextEngineOptions): PagesTextEngine {
  const { template } = options;
  const measureContext = measureIn(options);
  const text = createTextLayout({
    template,
    measureContext,
    codeLineNumbers: options.codeLineNumbers,
  });
  const host = atomHost(options.measureIn);
  const atoms = createAtomCache({ measure: createDomAtomMeasurer({ host }) });
  let numbers = NO_NUMBERS;
  const geometry = createBlockLayout({
    text: numberedText(text, () => numbers),
    atoms,
    metrics: (scope) => blockMetrics(template, scope),
  });
  let blocks = new WeakMap<ProseMirrorNode, KeptBlock>();
  let lines = new WeakMap<ProseMirrorNode, KeptLines>();
  const counts = { laid: 0, refused: 0, reasons: new Map<string, number>() };
  const widths = new Map<string | null, number>();
  const widthOf = (scope: string | null) => {
    let width = widths.get(scope);
    if (width === undefined) {
      width = contentWidth(template, scope);
      widths.set(scope, width);
    }
    return width;
  };
  const unsubscribe = atoms.subscribe(() => {
    blocks = new WeakMap();
    lines = new WeakMap();
    options.onAtomsSettled();
  });

  return {
    template,
    number(doc) {
      numbers = numbersByNode(doc, template).byNode;
    },
    numbering: (doc) => numbersByNode(doc, template).numbering,
    measureBlock(node, scope) {
      const key = `${scope ?? ''}|${numbers.keyOf(node)}`;
      const kept = blocks.get(node);
      if (kept?.key === key) return kept.block;
      const result = geometry.layoutBlock(node, { width: widthOf(scope), scope });
      if (!result.ok) {
        counts.refused += 1;
        const reason = result.reason;
        counts.reasons.set(reason, (counts.reasons.get(reason) ?? 0) + 1);
        return null;
      }
      counts.laid += 1;
      if (!result.provisional) blocks.set(node, { key, block: result.block });
      return result.block;
    },
    lines(node, place) {
      const key = `${place.scope ?? ''}|${place.prefix ?? ''}`;
      const kept = lines.get(node);
      if (kept?.key === key) return kept.table;
      const width = widthOf(place.scope);
      const result = text.layoutText(node, { width, scope: place.scope, prefix: place.prefix });
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
