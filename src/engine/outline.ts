// The document's outline: its headings in order, with their level, text and element id, each once
// though the pages split it, and the one the selection is under, for a host's navigation panel; and
// the span of content a heading heads, for a host that scopes a review or a comparison to it.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import {
  catalogDocument,
  isStructuralHeading,
  regionKind,
  type TemplateFile,
} from '../model/index.js';

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
  /** The highlight it is under: its own, or else the nearest heading's above it; else null. */
  readonly highlight: string | null;
}

/** How the outline reads the document. */
export interface OutlineOptions {
  /** Highlights by heading element id, such as a review's scope; each covers its subheadings. */
  readonly highlights?: ReadonlyMap<string, string> | undefined;
}

/**
 * The document's headings, in order, with the one the selection is under, numbered as the template
 * numbers them when it is given.
 */
export function documentOutline(
  state: EditorState,
  template?: TemplateFile,
  { highlights }: OutlineOptions = {},
): OutlineEntry[] {
  const numbers = new Map(
    template
      ? (catalogDocument(state.doc, template).toc ?? []).map((entry) => [entry.pos, entry.number])
      : [],
  );
  const found: Omit<OutlineEntry, 'active' | 'highlight'>[] = [];
  const seen = new Set<string>();
  state.doc.descendants((node, pos) => {
    if (regionKind(node) === 'header' || regionKind(node) === 'footer') return false;
    if (node.type.name !== 'heading') return !node.isTextblock;
    // Only the document's structure: not its title, nor a heading in a list, a table or a quote.
    if (!isStructuralHeading(state.doc, pos)) return false;
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
  const under = highlightsUnder(found, highlights);
  return found.map((entry, index) => ({
    ...entry,
    active: index === active,
    highlight: under[index] ?? null,
  }));
}

// Each heading's highlight: its own, or else the one of the nearest heading above it.
function highlightsUnder(
  entries: readonly { readonly elementId: string | null; readonly level: number }[],
  highlights: ReadonlyMap<string, string> | undefined,
): (string | null)[] {
  if (!highlights?.size) return entries.map(() => null);
  const open: { level: number; highlight: string | null }[] = [];
  return entries.map(({ elementId, level }) => {
    while ((open.at(-1)?.level ?? 0) >= level) open.pop();
    const highlight = (elementId && highlights.get(elementId)) || (open.at(-1)?.highlight ?? null);
    open.push({ level, highlight });
    return highlight;
  });
}

/**
 * The span a structural heading heads: from the heading to the next structural heading of its
 * level or above, or else to the end of the document's last content; null for a position that
 * holds no structural heading.
 */
export function headingSectionSpan(
  doc: ProseMirrorNode,
  pos: number,
): { readonly from: number; readonly to: number } | null {
  const node = doc.nodeAt(pos);
  if (!node || !isStructuralHeading(doc, pos)) return null;
  const level = Number(node.attrs.level);
  let to = pos + node.nodeSize;
  let ended = false;
  doc.descendants((child, at) => {
    if (ended) return false;
    const kind = regionKind(child);
    if (kind === 'content') {
      if (at + child.nodeSize > to) to = Math.max(to, at + child.nodeSize - 1);
      return at + child.nodeSize > pos;
    }
    if (kind !== null) return false;
    if (at <= pos || child.type.name !== 'heading') return !child.isTextblock;
    if (Number(child.attrs.level) <= level && isStructuralHeading(doc, at)) {
      ended = true;
      to = at;
    }
    return false;
  });
  return { from: pos, to };
}
