// Abbreviations: references to a glossary's entries, shown in full, `Ground support equipment
// (GSE)`, or short, `GSE`. They are inserted at the selection, switched between their forms,
// refreshed from the glossary as its entries change, and turned back into plain text.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type Command, type EditorState, NodeSelection } from 'prosemirror-state';
import { abbreviationDisplayText } from '../model/index.js';

/** A glossary entry as an abbreviation cites it. */
export interface AbbreviationEntry {
  readonly id: string;
  readonly abbreviation: string;
  readonly expansion: string;
}

/** How an abbreviation reads: its expansion and the abbreviation, or the abbreviation alone. */
export type AbbreviationDisplay = 'full' | 'short';

/** The abbreviation selected, with its position, or null. */
export function abbreviationAt(state: EditorState): { node: ProseMirrorNode; pos: number } | null {
  const { selection } = state;
  return selection instanceof NodeSelection && selection.node.type.name === 'abbreviation_reference'
    ? { node: selection.node, pos: selection.from }
    : null;
}

/**
 * Inserts an abbreviation of a glossary entry in place of the selection, carrying the marks of the
 * text it replaces, or those at the caret, and selects it.
 */
export function insertAbbreviation(
  entry: AbbreviationEntry,
  display: AbbreviationDisplay = 'full',
): Command {
  return (state, dispatch) => {
    const type = state.schema.nodes.abbreviation_reference;
    const { $from } = state.selection;
    if (!type || !$from.parent.inlineContent) return false;
    if (!$from.parent.canReplaceWith($from.index(), $from.indexAfter(), type)) return false;
    if (dispatch) {
      const { $to, empty } = state.selection;
      const marks = (empty ? state.storedMarks : $from.marksAcross($to)) ?? $from.marks();
      const node = type.create(
        { entryId: entry.id, display, abbr: entry.abbreviation, expansion: entry.expansion },
        null,
        $from.parent.type.allowedMarks(marks),
      );
      const tr = state.tr.replaceSelectionWith(node, false);
      const pos = tr.mapping.map(state.selection.from, -1);
      tr.setSelection(NodeSelection.create(tr.doc, pos));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

/** Shows the abbreviation selected in full or short; switches its form by default. */
export function setAbbreviationDisplay(display?: AbbreviationDisplay): Command {
  return (state, dispatch) => {
    const found = abbreviationAt(state);
    if (!found) return false;
    const next = display ?? (found.node.attrs.display === 'short' ? 'full' : 'short');
    if (next === found.node.attrs.display) return false;
    if (dispatch) {
      const tr = state.tr.setNodeMarkup(found.pos, undefined, {
        ...found.node.attrs,
        display: next,
      });
      dispatch(tr.setSelection(NodeSelection.create(tr.doc, found.pos)));
    }
    return true;
  };
}

/** Turns the abbreviation selected into plain text, as it reads, keeping its marks. */
export const unlinkAbbreviation: Command = (state, dispatch) => {
  const found = abbreviationAt(state);
  if (!found) return false;
  const text = abbreviationDisplayText(found.node.attrs);
  if (dispatch) {
    const tr = text
      ? state.tr.replaceWith(found.pos, found.pos + 1, state.schema.text(text, found.node.marks))
      : state.tr.delete(found.pos, found.pos + 1);
    dispatch(tr.scrollIntoView());
  }
  return true;
};

/**
 * Brings the document's abbreviations up to date with the glossary's entries, by id: their
 * abbreviation and expansion as the glossary has them now. Abbreviations of entries it does not
 * give are left as they are.
 */
export function refreshAbbreviations(entries: readonly AbbreviationEntry[]): Command {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return (state, dispatch) => {
    const changes: { pos: number; attrs: Record<string, unknown> }[] = [];
    state.doc.descendants((node, pos) => {
      if (node.type.name !== 'abbreviation_reference') return true;
      const entry = byId.get(String(node.attrs.entryId));
      if (!entry) return false;
      const { abbreviation: abbr, expansion } = entry;
      if (node.attrs.abbr !== abbr || node.attrs.expansion !== expansion) {
        changes.push({ pos, attrs: { ...node.attrs, abbr, expansion } });
      }
      return false;
    });
    if (changes.length === 0) return false;
    if (dispatch) {
      const tr = state.tr;
      for (const { pos, attrs } of changes) tr.setNodeMarkup(pos, undefined, attrs);
      dispatch(tr);
    }
    return true;
  };
}

/** The glossary entries the document's abbreviations cite, by id, as they last read. */
export function documentAbbreviations(doc: ProseMirrorNode): AbbreviationEntry[] {
  const found = new Map<string, AbbreviationEntry>();
  doc.descendants((node) => {
    if (node.type.name !== 'abbreviation_reference') return true;
    const id = String(node.attrs.entryId);
    if (id && !found.has(id)) {
      found.set(id, {
        id,
        abbreviation: String(node.attrs.abbr),
        expansion: String(node.attrs.expansion),
      });
    }
    return false;
  });
  return [...found.values()];
}
