// A text block's content as Pretext rich inline items: one run per stretch between hard breaks,
// each item with the content offset it starts at. Each text node is its own item, as Chromium
// rounds each element's piece of a line on its own; Pretext still kerns across same-font items.

import type { RichInlineBox, RichInlineItem } from '@chenglou/pretext/rich-inline';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { AtomPlace } from './atoms.js';
import { TEXT_ATOMS, textAtomItem, type TextAtomSource } from './text-atoms.js';
import { citationIdentifiers } from '../model/citation-identifiers.js';
import { type BlockTypography, fontString, type FontStyle, markedFont } from './typography.js';

/** An inline atom's box, in CSS pixels. */
interface InlineAtomSize {
  readonly width: number;
  readonly height: number;
  /** The distance from the box's top to its baseline; the bottom when not given. */
  readonly baseline?: number | undefined;
  /** Whether it is aligned to its line's top or bottom rather than on the baseline. */
  readonly align?: 'top' | 'bottom' | undefined;
}

/**
 * Sizes an inline atom the engine cannot lay out as text, drawn in its text block and scope; null
 * when it is not known yet.
 */
export type MeasureAtom = (node: ProseMirrorNode, place: AtomPlace) => InlineAtomSize | null;

/** One stretch of a block's content between hard breaks. */
export interface TextRun {
  /** The content offset the run starts at. */
  readonly start: number;
  /** The content offset after the run, past the hard break that ends it. */
  readonly end: number;
  /** Whether a hard break ends the run. */
  readonly endsWithBreak: boolean;
  readonly items: readonly (RichInlineItem | RichInlineBox)[];
  /** Each item's content offset; text before the content, such as a heading's number, has -1. */
  readonly offsets: readonly number[];
  /** Each item's box on the line: an atom's size, or text's in another font; null otherwise. */
  readonly atoms: readonly (InlineAtomSize | null)[];
}

/** A block's runs, or why its content cannot be laid out. */
type TextRuns =
  | { readonly ok: true; readonly runs: readonly TextRun[] }
  | { readonly ok: false; readonly reason: string };

/** What a block's runs are built from. */
interface RunInput {
  readonly node: ProseMirrorNode;
  readonly typography: BlockTypography;
  /** Text drawn before the content: in the block's font, or as an item in its own font. */
  readonly prefix?: string | RichInlineItem | undefined;
  /** The width of a box drawn before the content, such as a paragraph's number. */
  readonly lead?: number | undefined;
  readonly measureAtom?: MeasureAtom | undefined;
  /** The template section the block is in, which its atoms are measured in. */
  readonly scope?: string | null | undefined;
  /** The inline atoms laid out as their text (`TEXT_ATOMS` by default), and their numbers. */
  readonly textAtoms?:
    (TextAtomSource & { readonly types?: ReadonlySet<string> | undefined }) | undefined;
  /** The box a text item in another font takes on its line; null when it cannot grow the line. */
  readonly boxOf?: ((font: FontStyle) => InlineAtomSize | null) | undefined;
}

/** The padding inline code takes on each side of each of its lines. */
const INLINE_CODE_PADDING = 3;

interface Builder {
  items: (RichInlineItem | RichInlineBox)[];
  offsets: number[];
  atoms: (InlineAtomSize | null)[];
  start: number;
}

const startRun = (start: number): Builder => ({ items: [], offsets: [], atoms: [], start });

function addText(
  run: Builder,
  { item, offset, box }: { item: RichInlineItem; offset: number; box: InlineAtomSize | null },
) {
  run.items.push(item);
  run.offsets.push(offset);
  run.atoms.push(box);
}

// The box text in its marks' font takes on the line: its own font's, at the inherited line height.
// Subscript and superscript are drawn without growing the line.
function textBox(child: ProseMirrorNode, input: RunInput): InlineAtomSize | null {
  const shifted = child.marks.some((mark) => /^(sub|super)script$/.test(mark.type.name));
  if (shifted || !input.boxOf) return null;
  const font = markedFont(input.typography, child.marks);
  return fontString(font) === fontString(input.typography.font) ? null : input.boxOf(font);
}

function finish(run: Builder, end: number, endsWithBreak: boolean): TextRun {
  return { ...run, end, endsWithBreak };
}

function textItem(child: ProseMirrorNode, typography: BlockTypography): RichInlineItem {
  const font = fontString(markedFont(typography, child.marks));
  const names = new Set(child.marks.map((mark) => mark.type.name));
  const text = child.text ?? child.textContent;
  // A line that ends inside the code fits without its end padding, as Chromium fits a cloned box.
  if (names.has('code'))
    return { text, font, extraWidth: 2 * INLINE_CODE_PADDING, extraWidthEnd: INLINE_CODE_PADDING };
  // Chromium places the end of a line in underlined text exactly, its last letter's full width.
  if (names.has('link') || names.has('underline')) return { text, font, accurateLineEnds: true };
  return { text, font };
}

// Adds an inline atom to a run: as its text, or as a box of the size measured; the reason when it
// cannot be laid out.
function addAtom(
  run: Builder,
  { child, offset, input }: { child: ProseMirrorNode; offset: number; input: RunInput },
): string | null {
  const name = child.type.name;
  const refused = input.textAtoms?.refused?.get(name);
  if (refused !== undefined) return refused;
  let item: RichInlineItem | RichInlineBox | null;
  let size: InlineAtomSize | null = null;
  if ((input.textAtoms?.types ?? TEXT_ATOMS).has(name)) {
    item = textAtomItem(child, input.typography, input.textAtoms ?? {});
    if (!item) return `no text for inline ${name}`;
  } else {
    size = input.measureAtom?.(child, { parent: input.node, scope: input.scope }) ?? null;
    if (!size) return `no size for inline ${name}`;
    item = { width: size.width };
  }
  run.items.push(item);
  run.offsets.push(offset);
  run.atoms.push(size);
  return null;
}

// A fragment after the first of a split block.
const isContinued = (node: ProseMirrorNode) => Number(node.attrs.splitPartIndex ?? 0) > 0;
// A text node's pieces, cut where a citation's identifier starts and ends: each identifier piece
// is one unbreakable item, as the stylesheet keeps it whole (DOCE-REFERENCES-1.13), and is its own
// element on the line, as the identifier's decoration draws it.
function textPieces(
  child: ProseMirrorNode,
  { offset, typography, identifiers }: PieceInput,
): { item: RichInlineItem; offset: number }[] {
  const item = textItem(child, typography);
  const end = offset + child.nodeSize;
  const inside = identifiers.filter(([from, to]) => from < end && to > offset);
  if (!inside.length) return [{ item, offset }];
  const cuts = [...new Set([offset, ...inside.flat(), end])]
    .filter((cut) => cut >= offset && cut <= end)
    .sort((a, b) => a - b);
  const pieces: { item: RichInlineItem; offset: number }[] = [];
  for (let index = 0; index + 1 < cuts.length; index += 1) {
    const from = cuts[index] ?? offset;
    const to = cuts[index + 1] ?? end;
    const text = item.text.slice(from - offset, to - offset);
    const whole = inside.some(([start, stop]) => start <= from && to <= stop);
    pieces.push({ item: { ...item, text, ...(whole ? { break: 'never' } : {}) }, offset: from });
  }
  return pieces;
}

interface PieceInput {
  readonly offset: number;
  readonly typography: BlockTypography;
  /** The block's citation identifiers, as content ranges. */
  readonly identifiers: readonly (readonly [number, number])[];
}

/** A block's runs: its text and inline atoms between hard breaks, with their content offsets. */
export function buildRuns(input: RunInput): TextRuns {
  const { node, typography, prefix, lead } = input;
  const runs: TextRun[] = [];
  let run = startRun(0);
  if (lead) {
    run.items.push({ width: lead });
    run.offsets.push(-1);
    run.atoms.push(null);
  }
  if (prefix) {
    run.items.push(
      typeof prefix === 'string' ? { text: prefix, font: fontString(typography.font) } : prefix,
    );
    run.offsets.push(-1);
    run.atoms.push(null);
  }
  let failure: string | null = null;
  const identifiers = citationIdentifiers(node);
  node.forEach((child, offset) => {
    if (failure) return;
    if (child.type.name === 'hard_break') {
      // A fragment that continues a split paragraph starts with the break the line before it
      // ended on; the stylesheet hides it, so it starts no line (DOCE-PAGINATION-4.13).
      if (offset === 0 && !run.items.length && isContinued(node)) {
        run = startRun(child.nodeSize);
        return;
      }
      runs.push(finish(run, offset + child.nodeSize, true));
      run = startRun(offset + child.nodeSize);
    } else if (child.isText) {
      const box = textBox(child, input);
      for (const piece of textPieces(child, { offset, typography, identifiers }))
        addText(run, { ...piece, box });
    } else if (child.type.name === 'template_variable') {
      // Its value is drawn inside it (`createPageVariables`) and may be the page's own number.
      failure = 'template variable';
    } else {
      failure = addAtom(run, { child, offset, input });
    }
  });
  if (failure) return { ok: false, reason: failure };
  runs.push(finish(run, node.content.size, false));
  return { ok: true, runs };
}
