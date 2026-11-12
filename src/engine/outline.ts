// The document's outline: its headings in order, with their level, text and element id, each once
// though the pages split it, and the one the selection is under, for a host's navigation panel.

import type { EditorState } from 'prosemirror-state';
import { catalogDocument, regionKind, type TemplateFile } from '../model/index.js';

/** A heading of the outline. */
export interface OutlineEntry {
  readonly elementId: string | null;
  readonly level: number;
  readonly text: string;
  /** Its number as the template numbers it, when the outline is given the template; else empty. */
  readonly number: string;
  /** The position just inside the heading. */
  readonly pos: number;
  /** Whether the selection is under this heading: the last heading at or before it. */
  readonly active: boolean;
}

/**
 * The document's headings, in order, with the one the selection is under, numbered as the template
 * numbers them when it is given.
 */
export function documentOutline(state: EditorState, template?: TemplateFile): OutlineEntry[] {
  const numbers = new Map(
    template
      ? (catalogDocument(state.doc, template).toc ?? []).map((entry) => [entry.pos, entry.number])
      : [],
  );
  const found: Omit<OutlineEntry, 'active'>[] = [];
  const seen = new Set<string>();
  state.doc.descendants((node, pos, parent) => {
    if (regionKind(node) === 'header' || regionKind(node) === 'footer') return false;
    // A heading inside a list or a table is not part of the outline.
    if (parent && ['list_item', 'table_cell', 'table_header'].includes(parent.type.name)) {
      return false;
    }
    if (node.type.name !== 'heading') return !node.isTextblock;
    const id = typeof node.attrs.dataId === 'string' ? node.attrs.dataId : null;
    if (id && seen.has(id)) return false;
    if (id) seen.add(id);
    found.push({
      elementId: id,
      level: Number(node.attrs.level),
      text: node.textContent,
      number: numbers.get(pos)?.trim() ?? '',
      pos: pos + 1,
    });
    return false;
  });
  const head = state.selection.head;
  let active = -1;
  found.forEach((entry, index) => {
    if (entry.pos <= head + 1) active = index;
  });
  return found.map((entry, index) => ({ ...entry, active: index === active }));
}
