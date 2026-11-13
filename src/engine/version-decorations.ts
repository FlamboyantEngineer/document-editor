// The decorations that show a version's changes on a document: each changed block marked with its
// kind (`data-diff-change`) for a change bar beside it, the words of a block whose text changed
// marked by the kind of change on their line (`data-diff-line`), for a bar beside each line that
// changed, and, in markup, the words a block gained and lost, and the blocks it lost, in place. The
// decorations of a block's own change are told apart from those of the blocks deleted before or
// after it, so one block's change shows again without drawing the others.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { VersionChange } from './version-compare.js';
import type { VersionSpan } from './version-scope.js';

/** How changes show: change bars only, or bars with the changed text marked in place. */
export type VersionChangeDisplay = 'bars' | 'markup';

const CHANGE_ATTR = 'data-diff-change';
const LINE_ATTR = 'data-diff-line';

// What marks a decoration as a block's own change, in its spec.
const OWN = { ownChange: true };

/** What changed in a block whose text changed: a run of its text, or where text was deleted. */
export interface ChangeLineMark {
  readonly kind: 'insertion' | 'deletion' | 'modification';
  readonly from: number;
  /** Where the run ends; the same as `from` where text was deleted. */
  readonly to: number;
  /** For a deletion: the text deleted there. */
  readonly text: string;
}

// The positions of a change's segments in the newer version: where each starts, and its runs.
function segmentAt(change: VersionChange, index: number, start: number) {
  return change.positions[index] ?? (change.positions[index - 1] ?? start - 1) + 1;
}

/**
 * The runs of text a block whose text changed gained, and where it lost text, each by its kind: a
 * run inserted, a run deleted, or a run replaced, which is a modification on the inserted run.
 */
export function changeLineMarks(change: VersionChange): ChangeLineMark[] {
  const marks: ChangeLineMark[] = [];
  const start = (change.parts[0]?.from ?? 0) + 1;
  const { segments } = change;
  let index = 0;
  segments.forEach((segment, at) => {
    const replaced =
      segments[at - 1]?.kind === (segment.kind === 'inserted' ? 'deleted' : 'inserted') ||
      segments[at + 1]?.kind === (segment.kind === 'inserted' ? 'deleted' : 'inserted');
    if (segment.kind === 'deleted') {
      const pos = segmentAt(change, index, start);
      // A replaced run's bar is its inserted run's.
      if (!replaced) marks.push({ kind: 'deletion', from: pos, to: pos, text: segment.text });
      return;
    }
    const length = segment.text.length;
    if (segment.kind === 'inserted') {
      for (const [from, to] of ranges(change.positions.slice(index, index + length))) {
        marks.push({ kind: replaced ? 'modification' : 'insertion', from, to, text: '' });
      }
    }
    index += length;
  });
  return marks;
}

// A deleted run of text, or a deleted block's text (`data-diff-block`).
function deletedText(owner: Document, text: string, block = false): HTMLElement {
  const element = owner.createElement('del');
  element.setAttribute(CHANGE_ATTR, 'deletion');
  if (block) element.setAttribute('data-diff-block', 'true');
  element.textContent = text;
  return element;
}

// Runs of consecutive positions, as ranges.
function ranges(positions: readonly number[]): [number, number][] {
  const found: [number, number][] = [];
  for (const pos of positions) {
    const last = found.at(-1);
    if (last?.[1] === pos) last[1] = pos + 1;
    else found.push([pos, pos + 1]);
  }
  return found;
}

// The words a changed block gained, marked by the kind of change on their line, and, in markup,
// those it lost in place before what follows them; in bars, where it lost them is marked alone.
function textDecorations(
  change: VersionChange,
  display: VersionChangeDisplay,
  decorations: Decoration[],
) {
  const markup = display === 'markup';
  for (const mark of changeLineMarks(change)) {
    if (mark.from !== mark.to) {
      const attrs: Record<string, string> = { [LINE_ATTR]: mark.kind };
      if (markup) attrs[CHANGE_ATTR] = 'insertion';
      decorations.push(Decoration.inline(mark.from, mark.to, attrs, OWN));
      continue;
    }
    const { from, text } = mark;
    decorations.push(
      Decoration.widget(
        from,
        (view) => {
          const owner = view.dom.ownerDocument;
          const element = markup ? deletedText(owner, text) : owner.createElement('span');
          element.setAttribute(LINE_ATTR, 'deletion');
          return element;
        },
        { ...OWN, side: -1, key: `del-${display}-${String(from)}-${text}` },
      ),
    );
  }
  // In markup, a replaced run's deleted text shows too.
  if (markup) replacedText(change, decorations);
}

// The text a block lost where it was replaced, in place before the run that replaced it.
function replacedText(change: VersionChange, decorations: Decoration[]) {
  let index = 0;
  const start = (change.parts[0]?.from ?? 0) + 1;
  change.segments.forEach((segment, at) => {
    if (segment.kind !== 'deleted') {
      index += segment.text.length;
      return;
    }
    const near = [change.segments[at - 1]?.kind, change.segments[at + 1]?.kind];
    if (!near.includes('inserted')) return;
    const pos = segmentAt(change, index, start);
    const text = segment.text;
    decorations.push(
      Decoration.widget(pos, (view) => deletedText(view.dom.ownerDocument, text), {
        ...OWN,
        side: -1,
        key: `del-${String(pos)}-${text}`,
      }),
    );
  });
}

// Marks the blocks before which, or after which, blocks were deleted; in markup, the deleted
// blocks' text shows inside them, first or last, so it is measured with them.
function deletionDecorations(changes: readonly VersionChange[], display: VersionChangeDisplay) {
  const decorations: Decoration[] = [];
  const marked = new Set<string>();
  for (const change of changes) {
    if (change.kind !== 'deletion' || !change.at) continue;
    const { from, to, after } = change.at;
    const key = `${String(from)}-${String(after)}`;
    if (!marked.has(key)) {
      marked.add(key);
      decorations.push(
        Decoration.node(from, to, { 'data-diff-deletion': after ? 'after' : 'before' }),
      );
    }
    if (display !== 'markup') continue;
    const text = change.text;
    const at = after ? to - 1 : from + 1;
    decorations.push(
      Decoration.widget(at, (view) => deletedText(view.dom.ownerDocument, text, true), {
        side: after ? 1 : -1,
        key: `deleted-${change.id ?? text}`,
      }),
    );
  }
  return decorations;
}

/**
 * The decorations of one block's own change: its parts marked with the change's kind and, for a
 * block whose text changed, its lines and words.
 */
export function blockChangeDecorations(
  change: VersionChange,
  display: VersionChangeDisplay = 'markup',
): Decoration[] {
  const decorations: Decoration[] = [];
  // A block whose text changed has a bar beside each line that changed, the others marked as
  // kept, or as formatted when its formatting changed too.
  const lines = change.kind === 'modification' && change.segments.length > 0;
  const attrs: Record<string, string> = { [CHANGE_ATTR]: change.kind };
  if (lines) attrs['data-diff-lines'] = change.formatChanged ? 'formatting' : 'kept';
  for (const part of change.parts) {
    decorations.push(Decoration.node(part.from, part.to, attrs, OWN));
  }
  if (lines) textDecorations(change, display, decorations);
  return decorations;
}

/** The decorations a set shows for the own change of the block in a span. */
export function shownBlockChange(decorations: DecorationSet, block: VersionSpan): Decoration[] {
  return decorations
    .find(block.from, block.to, (spec: { ownChange?: boolean }) => spec.ownChange === true)
    .filter((decoration) => decoration.from >= block.from && decoration.to <= block.to);
}

/** The decorations that show changes on a document. */
export function versionChangeDecorations(
  doc: ProseMirrorNode,
  changes: readonly VersionChange[],
  display: VersionChangeDisplay = 'markup',
): DecorationSet {
  const decorations = deletionDecorations(changes, display);
  for (const change of changes) decorations.push(...blockChangeDecorations(change, display));
  return DecorationSet.create(doc, decorations);
}
