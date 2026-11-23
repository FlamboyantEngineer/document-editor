// The parts of a citation that identify what it cites, its document's number, its revision and its
// target's number, as ranges of a text block's content. Each is kept as one unbreakable part, by
// the editor's decoration and the stylesheet on the browser's lines and by the text layout engine
// on its own, so a line breaks in a citation's title but never inside `PWR-100`, `Rev B` or
// `Table 2.1` (DOCE-REFERENCES-1.13).

import type { Mark, Node as ProseMirrorNode } from 'prosemirror-model';
import { readReferenceBaseline } from './reference-format.js';

/** A reference in the text: its range and its mark. */
export interface ReferenceAt {
  readonly from: number;
  readonly to: number;
  readonly mark: Mark;
}

/** Each reference of a text block, as the runs of text carrying the same mark, from `start`. */
export function referencesIn(block: ProseMirrorNode, start: number): ReferenceAt[] {
  const found: ReferenceAt[] = [];
  let pos = start;
  block.forEach((child) => {
    const end = pos + child.nodeSize;
    const mark = child.marks.find((each) => each.type.name === 'reference');
    const last = found.at(-1);
    if (mark && last && last.to === pos && last.mark.eq(mark)) {
      found[found.length - 1] = { ...last, to: end };
    } else if (mark) found.push({ from: pos, to: end, mark });
    pos = end;
  });
  return found;
}

/** The element id an internal reference cites, or null for another reference. */
export function internalTargetId(mark: Mark): string | null {
  const type = String(mark.attrs.refType ?? '');
  const id = mark.attrs.targetId as unknown;
  return type.startsWith('internal-') && typeof id === 'string' && id ? id : null;
}

// Each identifier a citation reads, by where it first reads in its text.
function identifiersOf(text: string, parts: readonly (string | null | undefined)[]) {
  const found: [number, number][] = [];
  for (const part of parts) {
    const value = part?.trim();
    const at = value ? text.indexOf(value) : -1;
    if (value && at >= 0) found.push([at, at + value.length]);
  }
  return found;
}

/** Where a text block's citations read their identifiers, as content ranges from `start`. */
export function citationIdentifiers(block: ProseMirrorNode, start = 0): [number, number][] {
  const ranges: [number, number][] = [];
  for (const reference of referencesIn(block, start)) {
    if (internalTargetId(reference.mark)) continue;
    const baseline = readReferenceBaseline(reference.mark.attrs.referenceBaseline);
    if (!baseline) continue;
    const text = block.textBetween(reference.from - start, reference.to - start);
    const parts = [baseline.numbering, baseline.revisionLabel, baseline.target?.numbering];
    for (const [from, to] of identifiersOf(text, parts))
      ranges.push([reference.from + from, reference.from + to]);
  }
  return ranges;
}
