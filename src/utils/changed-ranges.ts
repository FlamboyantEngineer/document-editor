// The ranges a change touched, so a plugin that follows changes reads only them, never the
// document's untouched sections.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import { ReplaceStep, type Step } from 'prosemirror-transform';

/** A range of a document, from one position to another. */
export interface ChangedRange {
  readonly from: number;
  readonly to: number;
}

// The ranges a step changed, in the document after it: what it replaced or inserted, or, for a
// step that moves no position, such as a mark or an attribute, where it applies.
function stepRanges(step: Step): ChangedRange[] {
  const ranges: ChangedRange[] = [];
  step.getMap().forEach((...range: number[]) => {
    // A range's start and end before the step, then after it.
    const [, , from = 0, to = 0] = range;
    ranges.push({ from, to });
  });
  if (ranges.length > 0) return ranges;
  const { from, to, pos } = step as Partial<Record<'from' | 'to' | 'pos', number>>;
  if (from !== undefined && to !== undefined) return [{ from, to }];
  return pos === undefined ? [] : [{ from: pos, to: pos + 1 }];
}

/**
 * The ranges of the last transaction's document that a run of transactions changed: replaced,
 * inserted, marked or given attributes, one for each range a step changed, mapped through the steps
 * after it.
 */
export function changedRanges(transactions: readonly Transaction[]): ChangedRange[] {
  const steps = transactions.flatMap((tr) => tr.steps);
  return steps.flatMap((step, index) =>
    stepRanges(step).map((range) => {
      let { from, to } = range;
      for (const later of steps.slice(index + 1)) {
        from = later.getMap().map(from, -1);
        to = later.getMap().map(to, 1);
      }
      return { from, to: Math.max(from, to) };
    }),
  );
}

/**
 * Visits the nodes a run of transactions changed in the last one's document, and the nodes holding
 * them, as `nodesBetween` does, each once.
 */
export function changedNodes(
  doc: ProseMirrorNode,
  transactions: readonly Transaction[],
  visit: (node: ProseMirrorNode, pos: number) => boolean,
): void {
  const seen = new Set<number>();
  for (const { from, to } of changedRanges(transactions)) {
    const start = Math.max(0, Math.min(from, doc.content.size));
    const end = Math.min(doc.content.size, Math.max(to, start + 1));
    doc.nodesBetween(start, end, (node, pos) => {
      if (seen.has(pos)) return !node.isTextblock;
      seen.add(pos);
      return visit(node, pos);
    });
  }
}

/**
 * Whether a step replaces inline content inside one textblock and nothing else: typing, deleting
 * or pasting text within a paragraph. `doc` is the document the step applies to.
 */
export function isTextStep(step: Step, doc: ProseMirrorNode): step is ReplaceStep {
  if (!(step instanceof ReplaceStep)) return false;
  const { slice } = step;
  if (slice.openStart > 0 || slice.openEnd > 0) return false;
  let inline = true;
  slice.content.forEach((node) => {
    inline &&= node.isInline;
  });
  if (!inline) return false;
  const $from = doc.resolve(step.from);
  return $from.parent.isTextblock && $from.sameParent(doc.resolve(step.to));
}
