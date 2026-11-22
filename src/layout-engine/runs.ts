// A text block's content as Pretext rich inline items: one run per stretch between hard breaks,
// each item with the content offset it starts at. Each text node is its own item, as Chromium
// rounds each element's piece of a line on its own; Pretext still kerns across same-font items.

import type { RichInlineBox, RichInlineItem } from '@chenglou/pretext/rich-inline';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type BlockTypography, type FontStyle, fontString, markedFont } from './typography.js';

/** An inline atom's box, in CSS pixels. */
interface InlineAtomSize {
  readonly width: number;
  readonly height: number;
  /** The distance from the box's top to its baseline; the bottom when not given. */
  readonly baseline?: number | undefined;
}

/** Sizes an inline atom the engine cannot lay out as text; null when it is not known yet. */
export type MeasureAtom = (node: ProseMirrorNode) => InlineAtomSize | null;

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

function addText(run: Builder, item: RichInlineItem, offset: number, box: InlineAtomSize | null) {
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

/** A block's runs: its text and inline atoms between hard breaks, with their content offsets. */
export function buildRuns(input: RunInput): TextRuns {
  const { node, typography, prefix, lead, measureAtom } = input;
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
  node.forEach((child, offset) => {
    if (failure) return;
    if (child.type.name === 'hard_break') {
      runs.push(finish(run, offset + child.nodeSize, true));
      run = startRun(offset + child.nodeSize);
    } else if (child.isText) {
      addText(run, textItem(child, typography), offset, textBox(child, input));
    } else if (child.type.name === 'template_variable') {
      const item = { ...textItem(child, typography), break: 'never' as const };
      addText(run, item, offset, textBox(child, input));
    } else {
      const size = measureAtom?.(child) ?? null;
      if (!size) failure = `no size for inline ${child.type.name}`;
      else {
        run.items.push({ width: size.width });
        run.offsets.push(offset);
        run.atoms.push(size);
      }
    }
  });
  if (failure) return { ok: false, reason: failure };
  runs.push(finish(run, node.content.size, false));
  return { ok: true, runs };
}
