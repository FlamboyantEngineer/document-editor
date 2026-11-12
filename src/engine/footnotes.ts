// Footnotes: inserting one at the caret, its marker in the text and its entry in the footnote area
// of the page, with the caret in the entry; keeping entries and markers together and in order;
// numbering them in document order where the pages do not; and moving between a marker and its
// entry, marking where the reader arrives.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import {
  type Command,
  type EditorState,
  Plugin,
  TextSelection,
  type Transaction,
} from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { createElementId } from './element-ids.js';
import { boundaryMarks } from './footnote-marks.js';
import {
  canInsertFootnote,
  defaultCitingPlaces,
  footnoteAreaAt,
  type FootnoteAt,
  type FootnoteRevealed,
  footnotesKey,
  type FootnotesMeta,
  type FootnotesPluginState,
  idOf,
  listFootnotes,
  markerRanks,
  numberFootnotes,
} from './footnote-model.js';
import { reconcileFootnotes } from './footnote-reconcile.js';
import { isInlineTextOnly, isRemoteTransaction } from './transaction-kind.js';

export type { FootnoteAt } from './footnote-model.js';
export { canInsertFootnote, listFootnotes, numberFootnotes } from './footnote-model.js';

/** How the footnote plugin numbers footnotes and where it lets them be cited. */
export interface FootnotesOptions {
  /**
   * Whether markers and entries are numbered in document order after each change; the pages number
   * them per page instead when the template asks for it. Defaults to true.
   */
  readonly numberInOrder?: (() => boolean) | undefined;
  /**
   * The blocks a citing paragraph may sit in, from its parent up to the page's content. Defaults to
   * lists, body cells, quotes and layout columns.
   */
  readonly citingPlaces?: readonly string[] | undefined;
  /**
   * Whether a change came from another writer, which their own editor reconciles. Defaults to
   * `isRemoteTransaction`.
   */
  readonly isRemote?: ((tr: Transaction) => boolean) | undefined;
  /** Makes the id of a footnote copied with its marker. Defaults to a new element id. */
  readonly newId?: (() => string) | undefined;
}

// The position, in the footnote area at `area`, before the first entry cited after `rank`.
function entryPlace(doc: ProseMirrorNode, area: number, rank: number): number {
  const ranks = markerRanks(doc);
  const node = doc.nodeAt(area);
  let place = area + (node?.nodeSize ?? 2) - 1;
  node?.forEach((entry, offset) => {
    const at = ranks.get(idOf(entry) ?? '');
    if (at !== undefined && at > rank && place === area + node.nodeSize - 1)
      place = area + 1 + offset;
  });
  return place;
}

/**
 * Inserts a footnote at the caret: its marker in the text and an empty entry in the footnote area
 * of the page, among the entries in marker order, numbered in document order, with the caret in the
 * entry. Refused where a footnote may not be cited (`canInsertFootnote`).
 */
export function insertFootnote(options: { readonly newId?: () => string } = {}): Command {
  return (state, dispatch) => {
    if (!canInsertFootnote(state)) return false;
    const { footnote_reference: marker, footnote_entry: entry } = state.schema.nodes;
    const area = footnoteAreaAt(state.doc, state.selection.from);
    if (!marker || !entry || area === null) return false;
    if (dispatch) {
      const id = (options.newId ?? createElementId)();
      const tr = state.tr.replaceSelectionWith(marker.create({ footnoteId: id }), false);
      const ranks = markerRanks(tr.doc);
      const place = entryPlace(tr.doc, tr.mapping.map(area), ranks.get(id) ?? ranks.size);
      tr.insert(place, entry.create({ footnoteId: id }));
      numberFootnotes(tr);
      tr.setSelection(TextSelection.create(tr.doc, place + 1));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

/** The footnote whose marker is selected or whose entry holds the selection, or null. */
export function footnoteAt(state: EditorState): FootnoteAt | null {
  const { selection } = state;
  const node = state.doc.nodeAt(selection.from);
  let id = node?.type.name === 'footnote_reference' ? idOf(node) : null;
  const { $from } = selection;
  for (let depth = $from.depth; depth > 0 && !id; depth -= 1) {
    if ($from.node(depth).type.name === 'footnote_entry') id = idOf($from.node(depth));
  }
  return id ? (listFootnotes(state.doc).get(id) ?? null) : null;
}

// A transaction taking the reader to a part of a footnote, marked as where they arrived.
const revealing = (tr: Transaction, reveal: FootnoteRevealed) =>
  tr.setMeta(footnotesKey, { reveal } satisfies FootnotesMeta).scrollIntoView();

/** Puts the caret at the end of the footnote's entry, which shows `data-de-revealed`. */
export function editFootnote(id: string): Command {
  return (state, dispatch) => {
    const at = listFootnotes(state.doc).get(id);
    if (at?.entry === null || at === undefined) return false;
    const entry = state.doc.nodeAt(at.entry);
    if (!entry) return false;
    const end = at.entry + entry.nodeSize - 1;
    const tr = state.tr.setSelection(TextSelection.create(state.doc, end));
    dispatch?.(revealing(tr, { id, part: 'entry', pos: at.entry }));
    return true;
  };
}

/** Puts the caret after the footnote's marker in the text, which shows `data-de-revealed`. */
export function goToFootnoteMarker(id: string): Command {
  return (state, dispatch) => {
    const at = listFootnotes(state.doc).get(id);
    if (at?.marker === null || at === undefined) return false;
    const tr = state.tr.setSelection(TextSelection.create(state.doc, at.marker + 1));
    dispatch?.(revealing(tr, { id, part: 'marker', pos: at.marker }));
    return true;
  };
}

/** Deletes a footnote: its marker and its entry. */
export function deleteFootnote(id: string): Command {
  return (state, dispatch) => {
    const at = listFootnotes(state.doc).get(id);
    if (!at || at.marker === null) return false;
    if (dispatch) {
      const tr = state.tr;
      const positions = [at.marker, at.entry].filter((pos): pos is number => pos !== null);
      for (const pos of positions.sort((a, b) => b - a)) {
        const node = tr.doc.nodeAt(pos);
        if (node) tr.delete(pos, pos + node.nodeSize);
      }
      numberFootnotes(tr);
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

// The element an event happened on, from any window, or null.
const elementOf = (target: EventTarget | null): Element | null =>
  target && (target as Node).nodeType === 1 ? (target as Element) : null;

// Where the reader arrived, followed through layout and remote changes, and forgotten once the
// writer moves on or edits.
function nextRevealed(tr: Transaction, revealed: FootnoteRevealed | null) {
  const meta = tr.getMeta(footnotesKey) as FootnotesMeta | undefined;
  if (meta?.reveal) return meta.reveal;
  if (!revealed || !(tr.docChanged || tr.selectionSet)) return revealed;
  if (tr.getMeta('addToHistory') !== false) return null;
  const { pos, deleted } = tr.mapping.mapResult(revealed.pos, 1);
  const node = tr.doc.nodeAt(pos);
  return !deleted && node && idOf(node) === revealed.id ? { ...revealed, pos } : null;
}

function applyState(tr: Transaction, value: FootnotesPluginState): FootnotesPluginState {
  const bodies = (tr.getMeta(footnotesKey) as FootnotesMeta | undefined)?.bodies;
  const revealed = nextRevealed(tr, value.revealed);
  if (!bodies && revealed === value.revealed) return value;
  return {
    ...value,
    bodies: bodies ? new Map([...value.bodies, ...bodies]) : value.bodies,
    revealed,
  };
}

// The footnotes put back in order after the writer's changes, except changes to text alone.
function reconcileAfter(
  transactions: readonly Transaction[],
  [before, tr]: readonly [EditorState, Transaction],
  options: FootnotesOptions,
): boolean {
  const { isRemote = isRemoteTransaction } = options;
  const own = (t: Transaction) =>
    (t.getMeta(footnotesKey) as FootnotesMeta | undefined)?.reconciled;
  const local = transactions.filter(
    (t) => t.docChanged && t.getMeta('addToHistory') !== false && !isRemote(t) && !own(t),
  );
  if (local.length === 0 || local.every(isInlineTextOnly)) return false;
  const bodies = footnotesKey.getState(before)?.bodies ?? new Map();
  const newId = options.newId ?? createElementId;
  const { changed, kept } = reconcileFootnotes(tr, {
    before: before.doc,
    transactions,
    bodies,
    newId,
  });
  const numbered = (options.numberInOrder ?? (() => true))() && numberFootnotes(tr);
  const meta: FootnotesMeta = { reconciled: true, ...(kept.size > 0 ? { bodies: kept } : {}) };
  tr.setMeta(footnotesKey, meta);
  return changed || numbered;
}

/**
 * Keeps footnote entries with their markers after each of the writer's changes (`reconcileFootnotes`),
 * numbers them in document order, gives the caret beside a marker the marks of the text around it,
 * and marks the part of a footnote the reader was taken to with `data-de-revealed`.
 */
export function createFootnotes(options: FootnotesOptions = {}): Plugin<FootnotesPluginState> {
  return new Plugin<FootnotesPluginState>({
    key: footnotesKey,
    state: {
      init: () => ({
        places: new Set(options.citingPlaces ?? defaultCitingPlaces),
        bodies: new Map(),
        revealed: null,
      }),
      apply: applyState,
    },
    appendTransaction(transactions, before, after) {
      const tr = after.tr;
      let changed = reconcileAfter(transactions, [before, tr], options);
      const moved = transactions.some((t) => t.docChanged || t.selectionSet);
      const marks = moved && !transactions.some((t) => t.storedMarksSet);
      const beside = marks && tr.selection.empty ? boundaryMarks(tr.selection.$from) : null;
      if (beside) {
        tr.setStoredMarks(beside);
        changed = true;
      }
      return changed ? tr : null;
    },
    props: {
      decorations(state) {
        const revealed = footnotesKey.getState(state)?.revealed;
        const node = revealed ? state.doc.nodeAt(revealed.pos) : null;
        if (!revealed || !node) return DecorationSet.empty;
        const attrs = { 'data-de-revealed': revealed.part };
        return DecorationSet.create(state.doc, [
          Decoration.node(revealed.pos, revealed.pos + node.nodeSize, attrs),
        ]);
      },
      // A double click on a marker goes to its entry, and on an entry's number to its marker.
      handleDoubleClick(view, _pos, event) {
        const target = elementOf(event.target);
        const marker = target?.closest('[data-footnote-reference][data-footnote-id]');
        const number = target?.closest('.pm-footnote-entry-number');
        const entry = number?.closest('[data-footnote-entry][data-footnote-id]');
        const id = (marker ?? entry)?.getAttribute('data-footnote-id');
        if (!id) return false;
        const go = marker ? editFootnote(id) : goToFootnoteMarker(id);
        return go(view.state, view.dispatch);
      },
    },
  });
}
