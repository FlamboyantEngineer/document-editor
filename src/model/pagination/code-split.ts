// Splits code that does not fit on its page: a code block or linked code, at the last line break
// whose lines fit, or, when its first line is longer than a page, inside it at a wrapped line's
// start (DOCE-PAGINATION-3.3). It reads no DOM; the editor measured the code's lines.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { countPrefix } from '../../utils/count-prefix.js';
import type { LayoutBlock, SplitBlock, SplitContext } from './page-layout.js';
import { splitPartOf } from './split-part.js';
import { measuredLineRange, snapSplitHeight } from './text-line-split.js';
import {
  contentText,
  isTextMeasurement,
  memoize,
  splitBlock,
  splitTextNode,
  type TextSplitInput,
  type TextSplitPlan,
} from './text-split.js';

/** What a code split is planned from. */
interface CodeSplitInput extends TextSplitInput {
  /** Whether a first line that does not fit splits inside it, as on a page that holds nothing. */
  readonly wrapAtStart?: boolean | undefined;
}

// Where a code line longer than a page splits: at the start of the last wrapped line that fits, so
// each part keeps at least one; nothing is dropped, and the second part goes on with the line.
function planWrappedCodeSplit(
  input: Omit<CodeSplitInput, 'text'> & { length: number },
  overhead: number,
): TextSplitPlan | null {
  const { lines: measured, offset } = input.measurement;
  if (!measured) return null;
  const { lines, first, last } = measuredLineRange(measured.lines, {
    start: offset,
    end: offset + input.length,
    includeEnd: false,
  });
  let height = overhead;
  let index = first;
  while (index < last - 1) {
    const nextHeight = height + (lines[index]?.height ?? 0);
    if (!(nextHeight <= input.fitting)) break;
    height = nextHeight;
    index += 1;
  }
  const next = lines[index]?.from;
  if (index === first || next === undefined || next <= offset) return null;
  const headHeight = snapSplitHeight(height);
  return {
    end: next - offset,
    next: next - offset,
    headHeight,
    tailHeight: snapSplitHeight(input.height - headHeight + overhead),
  };
}

/**
 * Where code splits: at the last line break whose lines fit, which neither fragment keeps; null
 * when no line break fits or the second fragment would be empty. With `wrapAtStart`, as on a page
 * that holds nothing yet, a first line that does not fit splits at a wrapped line's start instead.
 */
export function planCodeSplit(input: CodeSplitInput): TextSplitPlan | null {
  return planIndexedCodeSplit(
    { ...input, length: input.text.length },
    { offsets: sourceBreaks(input.text), start: 0 },
  );
}

interface CodeBreaks {
  readonly offsets: readonly number[];
  /** Where this fragment begins in the text whose line breaks are indexed. */
  readonly start: number;
}

const codeBreaks = new WeakMap<ProseMirrorNode, CodeBreaks>();

function sourceBreaks(text: string): number[] {
  const offsets: number[] = [];
  // A terminal newline belongs to the last fragment and cannot leave a tail of its own.
  for (
    let at = text.indexOf('\n');
    at >= 0 && at < text.length - 1;
    at = text.indexOf('\n', at + 1)
  ) {
    offsets.push(at);
  }
  return offsets;
}

function planIndexedCodeSplit(
  input: Omit<CodeSplitInput, 'text'> & { length: number },
  breaks: CodeBreaks,
): TextSplitPlan | null {
  const { length, measurement } = input;
  const { offset, measure } = measurement;
  const { offsets, start } = breaks;
  // A break at the fragment's start ends a blank line, which can fit on a page by itself.
  const first = countPrefix(offsets.length, (index) => (offsets[index] ?? 0) < start);
  const overhead =
    measurement.overhead ?? Math.max(0, input.height - measure(offset, offset + length).height);
  const at = memoize((index) =>
    measure(offset, offset + ((offsets[first + index] ?? start) - start)),
  );
  const chosen =
    countPrefix(offsets.length - first, (index) => at(index).height + overhead <= input.fitting) -
    1;
  if (chosen < 0) return input.wrapAtStart ? planWrappedCodeSplit(input, overhead) : null;
  const end = (offsets[first + chosen] ?? start) - start;
  const tail = measure(offset + end + 1, offset + length);
  return {
    end,
    next: end + 1,
    headHeight: snapSplitHeight(at(chosen).height + overhead),
    tailHeight: snapSplitHeight(tail.height + overhead),
  };
}

function lineStart(value: unknown): number {
  const line = Number(value);
  return Number.isInteger(line) && line >= 1 ? line : 1;
}

// Whether code split inside a line: a split at a line break drops it, one inside a line nothing.
const insideLine = (plan: TextSplitPlan) => plan.next === plan.end;

/** A code block's two fragments, split at a plan: the second continued and numbered on. */
function splitCodeNode(
  node: ProseMirrorNode,
  plan: TextSplitPlan,
): [ProseMirrorNode, ProseMirrorNode] {
  const [head, tail] = splitTextNode(node, plan);
  const first = lineStart(node.attrs.codeLineStart);
  const inLine = insideLine(plan);
  const attrs = {
    ...tail.attrs,
    codeBlockContinued: true,
    codeLineContinued: inLine,
    codeLineStart: first + node.textBetween(0, plan.end).split('\n').length - (inLine ? 1 : 0),
  };
  return [head, tail.type.create(attrs, tail.content, tail.marks)];
}

/** Linked code's two fragments, split at a plan over its code. */
export function splitLinkedCode(
  node: ProseMirrorNode,
  plan: TextSplitPlan,
): [ProseMirrorNode, ProseMirrorNode] {
  const code = String(node.attrs.code ?? '');
  const part = splitPartOf(node) ?? 0;
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
      codeLineContinued: insideLine(plan),
      startLine: first + code.slice(0, plan.end).split('\n').length - (insideLine(plan) ? 1 : 0),
    },
    null,
    node.marks,
  );
  return [head, tail];
}

/** Splits a measured code block or linked code to fit a height. */
export function splitCode(
  block: LayoutBlock,
  fitting: number,
  context?: SplitContext,
): SplitBlock | null {
  if (!isTextMeasurement(block.measurement)) return null;
  const { node } = block;
  const linked = node.type.name === 'linked_code_block';
  const code = linked ? String(node.attrs.code ?? '') : null;
  const breaks = codeBreaks.get(node) ?? {
    offsets: sourceBreaks(code ?? contentText(node)),
    start: 0,
  };
  codeBreaks.set(node, breaks);
  const plan = planIndexedCodeSplit(
    {
      length: code?.length ?? node.content.size,
      height: block.height,
      fitting,
      measurement: block.measurement,
      wrapAtStart: context !== undefined && context.remainingHeight >= context.pageHeight,
    },
    breaks,
  );
  if (!plan) return null;
  const split = splitBlock(
    block,
    plan,
    linked ? splitLinkedCode(node, plan) : splitCodeNode(node, plan),
  );
  const [tail] = split.tail;
  if (tail) codeBreaks.set(tail.node, { offsets: breaks.offsets, start: breaks.start + plan.next });
  return split;
}
