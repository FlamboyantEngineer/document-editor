// Splits a paragraph or a code block that does not fit on its page. The editor measures the block's
// text between two offsets; this module chooses where to split and builds the two fragments, so it
// reads no DOM. Offsets are content offsets in the whole block, so a fragment split again is still
// measured against the block the editor laid out.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { LayoutBlock, SplitBlock } from './page-layout.js';

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
}

/** The fewest rendered lines either fragment of a split paragraph keeps. */
export const MINIMUM_SPLIT_LINES = 2;

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

function snap(value: number, minimum: number): number {
  return Number.isFinite(value) ? Math.max(minimum, Math.round(value * 1000) / 1000) : minimum;
}

// The last index in [0, count) a predicate holds for, when it holds for a prefix only; -1 for none.
function lastIndexWhere(count: number, holds: (index: number) => boolean): number {
  let low = 0;
  let high = count - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (holds(middle)) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

function memoize(measure: (index: number) => TextMeasure): (index: number) => TextMeasure {
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
}

// The word to end the first fragment after, keeping at least the minimum lines on each side.
function chooseWord(count: number, at: (index: number) => TextMeasure, input: TextSplitInput) {
  const last = count - 1;
  const total = at(last).lines;
  const overhead = Math.max(0, input.height - at(last).height);
  let chosen = lastIndexWhere(count, (index) => at(index).height + overhead <= input.fitting);
  if (chosen < 0 || chosen >= last) return -1;
  const before = MINIMUM_SPLIT_LINES;
  const after = Math.max(MINIMUM_SPLIT_LINES, Math.floor(input.minimumTrailingLines ?? 0));
  if (total - at(chosen).lines < after && at(chosen).lines > before) {
    const moved = lastIndexWhere(chosen + 1, (index) => at(index).lines <= total - after);
    if (moved > 0) chosen = moved;
  }
  const lines = at(chosen).lines;
  return lines >= before && total - lines >= after ? chosen : -1;
}

/**
 * Where a paragraph splits: after the last word that fits, keeping at least two rendered lines in
 * each fragment; null when it fits whole or cannot split.
 */
export function planParagraphSplit(input: TextSplitInput): TextSplitPlan | null {
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
  const headHeight = snap(at(chosen).height + overhead, 1);
  return {
    end: next,
    next,
    headHeight,
    tailHeight: snap(input.height - headHeight, 1),
  };
}

/**
 * Where code splits: at the last line break whose lines fit, which neither fragment keeps; null
 * when no line break fits or the second fragment would be empty.
 */
export function planCodeSplit(input: TextSplitInput): TextSplitPlan | null {
  const { text, measurement } = input;
  const { offset, measure } = measurement;
  const breaks = [...text.matchAll(/\n/g)].map((match) => match.index).filter((index) => index > 0);
  const overhead =
    measurement.overhead ??
    Math.max(0, input.height - measure(offset, offset + text.length).height);
  const at = memoize((index) => measure(offset, offset + (breaks[index] ?? 0)));
  const chosen = lastIndexWhere(
    breaks.length,
    (index) => at(index).height + overhead <= input.fitting,
  );
  const end = breaks[chosen];
  if (end === undefined || end + 1 >= text.length) return null;
  const tail = measure(offset + end + 1, offset + text.length);
  return {
    end,
    next: end + 1,
    headHeight: snap(at(chosen).height + overhead, 1),
    tailHeight: snap(tail.height + overhead, 1),
  };
}

function partIndex(node: ProseMirrorNode): number {
  const index = node.attrs.splitPartIndex as unknown;
  return typeof index === 'number' && Number.isInteger(index) && index >= 0 ? index : 0;
}

function lineStart(value: unknown): number {
  const line = Number(value);
  return Number.isInteger(line) && line >= 1 ? line : 1;
}

/** A text block's two fragments, split at a plan. */
export function splitTextNode(
  node: ProseMirrorNode,
  plan: TextSplitPlan,
): [ProseMirrorNode, ProseMirrorNode] {
  const part = partIndex(node);
  const head = node.type.create(
    { ...node.attrs, splitPartIndex: part },
    node.content.cut(0, plan.end),
    node.marks,
  );
  const tailAttrs: Record<string, unknown> = { ...node.attrs, splitPartIndex: part + 1 };
  if (node.type.name === 'code_block') {
    const first = lineStart(node.attrs.codeLineStart);
    tailAttrs.codeBlockContinued = true;
    tailAttrs.codeLineStart = first + node.textBetween(0, plan.end).split('\n').length;
  }
  const tail = node.type.create(tailAttrs, node.content.cut(plan.next), node.marks);
  return [head, tail];
}

/** Linked code's two fragments, split at a plan over its code. */
export function splitLinkedCode(
  node: ProseMirrorNode,
  plan: TextSplitPlan,
): [ProseMirrorNode, ProseMirrorNode] {
  const code = String(node.attrs.code ?? '');
  const part = partIndex(node);
  const first = lineStart(node.attrs.startLine);
  const head = node.type.create(
    { ...node.attrs, code: code.slice(0, plan.end), splitPartIndex: part },
    null,
    node.marks,
  );
  const tail = node.type.create(
    {
      ...node.attrs,
      code: code.slice(plan.next),
      splitPartIndex: part + 1,
      codeBlockContinued: true,
      startLine: first + code.slice(0, plan.end).split('\n').length,
    },
    null,
    node.marks,
  );
  return [head, tail];
}

function splitBlock(
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

/** A paragraph split whose second fragment keeps at least the given rendered lines. */
export function splitParagraphWith(minimumTrailingLines: number) {
  return (block: LayoutBlock, fitting: number): SplitBlock | null => {
    if (!isTextMeasurement(block.measurement)) return null;
    const plan = planParagraphSplit({
      text: contentText(block.node),
      height: block.height,
      fitting,
      measurement: block.measurement,
      minimumTrailingLines,
    });
    return plan ? splitBlock(block, plan, splitTextNode(block.node, plan)) : null;
  };
}

/** Splits a measured paragraph to fit a height. */
export const splitParagraph = splitParagraphWith(MINIMUM_SPLIT_LINES);

/** Splits a measured code block or linked code to fit a height. */
export function splitCode(block: LayoutBlock, fitting: number): SplitBlock | null {
  if (!isTextMeasurement(block.measurement)) return null;
  const linked = block.node.type.name === 'linked_code_block';
  const text = linked ? String(block.node.attrs.code ?? '') : contentText(block.node);
  const plan = planCodeSplit({
    text,
    height: block.height,
    fitting,
    measurement: block.measurement,
  });
  if (!plan) return null;
  return splitBlock(
    block,
    plan,
    linked ? splitLinkedCode(block.node, plan) : splitTextNode(block.node, plan),
  );
}
