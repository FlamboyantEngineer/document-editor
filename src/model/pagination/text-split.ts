// Splits a paragraph or a code block that does not fit on its page. The editor measures the block's
// text between two offsets; this module chooses where to split and builds the two fragments, so it
// reads no DOM. Offsets are content offsets in the whole block, so a fragment split again is still
// measured against the block the editor laid out.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { countPrefix } from '../../utils/count-prefix.js';
import type { LayoutBlock, SplitBlock } from './page-layout.js';
import { splitPartOf } from './split-part.js';
import {
  type MeasuredLines,
  MINIMUM_SPLIT_LINES,
  planLineSplit,
  snapSplitHeight,
} from './text-line-split.js';

export { MINIMUM_SPLIT_LINES } from './text-line-split.js';

/** The rendered height and line count of some text. */
export interface TextMeasure {
  height: number;
  lines: number;
}

/** What the editor measured a text block's layout from. */
export interface TextMeasurement {
  /** Where the fragment starts in the whole block: a content offset, or a character of linked code. */
  readonly offset: number;
  /** The rendered height and lines of the whole block's text between two offsets. */
  readonly measure: (from: number, to: number) => TextMeasure;
  /** The height the block takes beyond its text, which each code fragment repeats. */
  readonly overhead?: number | undefined;
  /**
   * For an object held with its caption, how much taller a later part's caption is, showing the
   * caption's text and the continued suffix, than the caption: the room a later part takes beyond
   * the first's (DOCE-PAGINATION-11.2); 0 by default.
   */
  readonly continuedCaption?: number | undefined;
  /** The whole block's computed lines, used to split paragraphs and long code lines. */
  readonly lines?: MeasuredLines | undefined;
}

const OBJECT_REPLACEMENT = '￼';

/** Whether a layout block carries a text measurement. */
export function isTextMeasurement(value: unknown): value is TextMeasurement {
  const candidate = value as Partial<TextMeasurement> | null;
  return typeof candidate?.offset === 'number' && typeof candidate.measure === 'function';
}

/**
 * A text block's content as a string indexed by content offset: inline nodes that are not text
 * take their size in replacement characters, so they join the word they touch.
 */
export function contentText(node: ProseMirrorNode): string {
  let text = '';
  node.forEach((child) => {
    text += child.isText ? (child.text ?? '') : OBJECT_REPLACEMENT.repeat(child.nodeSize);
  });
  return text;
}

export function memoize(measure: (index: number) => TextMeasure): (index: number) => TextMeasure {
  const measured = new Map<number, TextMeasure>();
  return (index) => {
    const known = measured.get(index);
    if (known) return known;
    const value = measure(index);
    measured.set(index, value);
    return value;
  };
}

/** Where a split falls in the fragment, and the heights of the two fragments. */
export interface TextSplitPlan {
  /** The offset in the fragment where the first fragment ends. */
  end: number;
  /** The offset in the fragment where the second fragment starts. */
  next: number;
  headHeight: number;
  tailHeight: number;
}

/** What a text split is planned from. */
export interface TextSplitInput {
  readonly text: string;
  readonly height: number;
  readonly fitting: number;
  readonly measurement: TextMeasurement;
  /** The fewest lines the second fragment keeps, at least two. */
  readonly minimumTrailingLines?: number | undefined;
  /**
   * How many characters at the fragment's start draw no line: the hard break an earlier split
   * moved there (DOCE-PAGINATION-3.6), so the line it ended stays with the fragment before.
   */
  readonly hiddenStart?: number | undefined;
}

// The word to end the first fragment after, keeping at least the minimum lines on each side.
function chooseWord(count: number, at: (index: number) => TextMeasure, input: TextSplitInput) {
  const last = count - 1;
  const total = at(last).lines;
  const overhead = Math.max(0, input.height - at(last).height);
  let chosen = countPrefix(count, (index) => at(index).height + overhead <= input.fitting) - 1;
  if (chosen < 0 || chosen >= last) return -1;
  const before = MINIMUM_SPLIT_LINES;
  const after = Math.max(MINIMUM_SPLIT_LINES, Math.floor(input.minimumTrailingLines ?? 0));
  if (total - at(chosen).lines < after && at(chosen).lines > before) {
    const moved = countPrefix(chosen + 1, (index) => at(index).lines <= total - after) - 1;
    if (moved > 0) chosen = moved;
  }
  const lines = at(chosen).lines;
  return lines >= before && total - lines >= after ? chosen : -1;
}

/**
 * Where a paragraph splits: at the start of the first line that does not fit when its lines were
 * computed, else after the last word that fits, keeping at least two rendered lines in each
 * fragment; null when it fits whole or cannot split.
 */
export function planParagraphSplit(input: TextSplitInput): TextSplitPlan | null {
  if (input.measurement.lines)
    return planLineSplit({ ...input, length: input.text.length }, input.measurement.lines);
  return planWordSplit(input);
}

function planWordSplit(input: TextSplitInput): TextSplitPlan | null {
  const words = [...input.text.matchAll(/\S+/g)];
  const { offset, measure } = input.measurement;
  const wordEnd = (index: number) => {
    const word = words[index];
    return word ? word.index + word[0].length : 0;
  };
  const at = memoize((index) => measure(offset, offset + wordEnd(index)));
  const chosen = words.length ? chooseWord(words.length, at, input) : -1;
  const next = words[chosen + 1]?.index;
  if (chosen < 0 || next === undefined) return null;
  const overhead = Math.max(0, input.height - at(words.length - 1).height);
  const headHeight = snapSplitHeight(at(chosen).height + overhead);
  return {
    end: next,
    next,
    headHeight,
    tailHeight: snapSplitHeight(input.height - headHeight),
  };
}

/** A text block's two fragments, split at a plan. */
export function splitTextNode(
  node: ProseMirrorNode,
  plan: TextSplitPlan,
): [ProseMirrorNode, ProseMirrorNode] {
  const part = splitPartOf(node) ?? 0;
  const head = node.type.create(
    { ...node.attrs, splitPartIndex: part },
    node.content.cut(0, plan.end),
    node.marks,
  );
  const tail = node.type.create(
    { ...node.attrs, splitPartIndex: part + 1 },
    node.content.cut(plan.next),
    node.marks,
  );
  return [head, tail];
}

export function splitBlock(
  block: LayoutBlock,
  plan: TextSplitPlan,
  nodes: [ProseMirrorNode, ProseMirrorNode],
): SplitBlock {
  const measurement = block.measurement as TextMeasurement;
  return {
    head: { ...block, node: nodes[0], height: plan.headHeight },
    tail: [
      {
        ...block,
        node: nodes[1],
        height: plan.tailHeight,
        breakBefore: true,
        measurement: { ...measurement, offset: measurement.offset + plan.next },
      },
    ],
  };
}

// Whether a later fragment starts with the hard break a split moved there, which draws no line.
function movedBreak(node: ProseMirrorNode): boolean {
  return (splitPartOf(node) ?? 0) > 0 && node.firstChild?.type.name === 'hard_break';
}

// A split after a hard break moves the break to the second fragment's start, where the stylesheet
// hides it: at the first fragment's end it would start a line no fragment holds
// (DOCE-PAGINATION-3.6).
function breakToTail(node: ProseMirrorNode, plan: TextSplitPlan): TextSplitPlan {
  if (plan.end !== plan.next) return plan;
  const before = node.childBefore(plan.end);
  const ends =
    before.node?.type.name === 'hard_break' && before.offset + before.node.nodeSize === plan.end;
  if (!ends || before.offset === 0) return plan;
  return { ...plan, end: before.offset, next: before.offset };
}

/** A paragraph split whose second fragment keeps at least the given rendered lines. */
export function splitParagraphWith(minimumTrailingLines: number) {
  return (block: LayoutBlock, fitting: number): SplitBlock | null => {
    if (!isTextMeasurement(block.measurement)) return null;
    const input = {
      height: block.height,
      fitting,
      measurement: block.measurement,
      minimumTrailingLines,
      hiddenStart: movedBreak(block.node) ? 1 : 0,
    };
    const { lines } = input.measurement;
    const plan = lines
      ? planLineSplit({ ...input, length: block.node.content.size }, lines)
      : planWordSplit({ ...input, text: contentText(block.node) });
    const at = plan && breakToTail(block.node, plan);
    return at ? splitBlock(block, at, splitTextNode(block.node, at)) : null;
  };
}

/** Splits a measured paragraph to fit a height. */
export const splitParagraph = splitParagraphWith(MINIMUM_SPLIT_LINES);
