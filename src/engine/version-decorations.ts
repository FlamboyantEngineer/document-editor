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

// The words of a text and the white space after each, the first with any space before it.
function wordsOf(text: string): string[] {
  const words = text.match(/\s*\S+\s*/gu) ?? [];
  return words.length ? words : text ? [text] : [];
}

/** Where deleted text is drawn, and how. */
interface DeletedWords {
  readonly pos: number;
  /** The texts deleted there, each a deleted block's on lines of its own when `alone`. */
  readonly texts: readonly string[];
  /** The widgets' key, which each word's extends. */
  readonly key: string;
  /** Deleted blocks' text: on lines of their own before the block's content, or after it. */
  readonly alone?: 'before' | 'after' | undefined;
  readonly own?: boolean | undefined;
  /** Sets the deleted words' other attributes. */
  readonly mark?: ((element: HTMLElement) => void) | undefined;
}

/** One element drawn among deleted words: a word, or a break before or after a deleted block. */
type DrawnWord = { readonly word: string; readonly group: string } | { readonly word: null };

// The elements drawn for deleted texts, in order: the words of each, a deleted block's text with a
// break after it before the content, or before it after the content.
function drawnWords({ texts, key, alone }: DeletedWords): DrawnWord[] {
  const drawn: DrawnWord[] = [];
  texts.forEach((text, index) => {
    if (alone === 'after') drawn.push({ word: null });
    const group = `${key}-${String(index)}`;
    for (const word of wordsOf(text)) drawn.push({ word, group });
    if (alone === 'before') drawn.push({ word: null });
  });
  return drawn;
}

/**
 * Deleted text drawn in place, word by word: each word, with the white space after it, a widget of
 * its own whose spec names the word (`insertedText`) and the text it is part of (`insertedGroup`),
 * so the pages' text layout lays the words out on the block's lines and a line can break between
 * two of them (DOCE-PAGINATION-11.11). The words of a text deleted inside a block come before what
 * follows them; deleted blocks' texts are on lines of their own, each with a break after it, or
 * before it, drawn by a widget of its own. The widgets' sides go up by 2 in drawing order, before
 * the content up to -2 and after it from 1, so a break can be drawn between any two.
 */
function deletedWords(words: DeletedWords): Decoration[] {
  const { pos, key, alone } = words;
  const drawn = drawnWords(words);
  const sideOf = (index: number) =>
    alone === 'after' ? 1 + 2 * index : -2 * (drawn.length - index);
  return drawn.map((each, index) => {
    const side = sideOf(index);
    if (each.word === null) {
      return Decoration.widget(
        pos,
        (view) => {
          const element = view.dom.ownerDocument.createElement('span');
          element.setAttribute('data-diff-block-break', 'true');
          return element;
        },
        { side, key: `${key}-break-${String(index)}` },
      );
    }
    const { word, group } = each;
    return Decoration.widget(
      pos,
      (view) => {
        const element = deletedText(view.dom.ownerDocument, word, Boolean(alone));
        words.mark?.(element);
        return element;
      },
      {
        ...(words.own ? OWN : {}),
        insertedText: word,
        insertedGroup: group,
        ...(alone ? { alone } : {}),
        side,
        key: index === 0 ? key : `${key}#${String(index)}`,
      },
    );
  });
}

// Whether the document still shows `text` at `pos`, just before or after it, as text suggested for
// deletion: a comparison that counts suggestions as accepted reads it as deleted, and inline markup
// shows it once, as the suggestion, not again as a deleted run.
function showsAsSuggestedDeletion(doc: ProseMirrorNode, pos: number, text: string): boolean {
  const suggested = (from: number, to: number) => {
    if (from < 0 || to > doc.content.size || doc.textBetween(from, to) !== text) return false;
    let all = true;
    doc.nodesBetween(from, to, (node) => {
      if (node.isText && !node.marks.some((mark) => mark.type.name === 'deletion')) all = false;
    });
    return all;
  };
  return (
    text.length > 0 && (suggested(pos - text.length, pos) || suggested(pos, pos + text.length))
  );
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
  { display, doc }: { display: VersionChangeDisplay; doc: ProseMirrorNode },
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
    const withText = markup && !showsAsSuggestedDeletion(doc, from, text);
    const key = `del-${display}-${String(withText)}-${String(from)}-${text}`;
    if (withText) {
      const line = (element: HTMLElement) => element.setAttribute(LINE_ATTR, 'deletion');
      decorations.push(...deletedWords({ pos: from, texts: [text], key, own: true, mark: line }));
      continue;
    }
    decorations.push(
      Decoration.widget(
        from,
        (view) => {
          const element = view.dom.ownerDocument.createElement('span');
          element.setAttribute(LINE_ATTR, 'deletion');
          return element;
        },
        { ...OWN, side: -1, key },
      ),
    );
  }
  // In markup, a replaced run's deleted text shows too.
  if (markup) replacedText(change, doc, decorations);
}

// The text a block lost where it was replaced, in place before the run that replaced it.
function replacedText(change: VersionChange, doc: ProseMirrorNode, decorations: Decoration[]) {
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
    if (showsAsSuggestedDeletion(doc, pos, text)) return;
    decorations.push(
      ...deletedWords({ pos, texts: [text], key: `del-${String(pos)}-${text}`, own: true }),
    );
  });
}

// Marks the blocks before which, or after which, blocks were deleted; in markup, the deleted
// blocks' text shows inside them, first or last, so it is measured with them.
function deletionDecorations(changes: readonly VersionChange[], display: VersionChangeDisplay) {
  const decorations: Decoration[] = [];
  // The deleted blocks' texts by where they show, in order.
  const places = new Map<string, { at: number; after: boolean; texts: string[]; ids: string[] }>();
  for (const change of changes) {
    if (change.kind !== 'deletion' || !change.at) continue;
    const { from, to, after } = change.at;
    const key = `${String(from)}-${String(after)}`;
    let place = places.get(key);
    if (!place) {
      place = { at: after ? to - 1 : from + 1, after, texts: [], ids: [] };
      places.set(key, place);
      decorations.push(
        Decoration.node(from, to, { 'data-diff-deletion': after ? 'after' : 'before' }),
      );
    }
    place.texts.push(change.text);
    place.ids.push(change.id ?? change.text);
  }
  if (display !== 'markup') return decorations;
  for (const { at, after, texts, ids } of places.values()) {
    const alone = after ? 'after' : 'before';
    decorations.push(...deletedWords({ pos: at, texts, key: `deleted-${ids.join(',')}`, alone }));
  }
  return decorations;
}

/**
 * The decorations of one block's own change: its parts marked with the change's kind and, for a
 * block whose text changed, its lines and words.
 */
export function blockChangeDecorations(
  change: VersionChange,
  { display = 'markup', doc }: { display?: VersionChangeDisplay; doc: ProseMirrorNode },
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
  if (lines) textDecorations(change, { display, doc }, decorations);
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
  for (const change of changes) {
    decorations.push(...blockChangeDecorations(change, { display, doc }));
  }
  return DecorationSet.create(doc, decorations);
}
