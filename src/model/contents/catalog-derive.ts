// Deriving a document's catalog from the one before a change, without counting the document again,
// for a change that only edits the text of one textblock the catalog reads no more than as a
// heading's or object's text: every entry keeps its number, level and page, those after the edit
// move by its size, and an edited block's entries take its new text. Any other change is counted
// again.

import type { Node as ProseMirrorNode, ResolvedPos } from 'prosemirror-model';
import { type Mapping, ReplaceStep, type Step } from 'prosemirror-transform';
import {
  type CatalogEntry,
  type ContentsKind,
  type DocumentCatalog,
  nodeEntry,
} from './contents-kinds.js';

/** A change the catalog follows: the documents before each step, its steps and its mapping. */
interface CatalogChange {
  /** The document before each step, then the document after the last. */
  readonly docs: readonly ProseMirrorNode[];
  readonly steps: readonly Step[];
  readonly mapping: Mapping;
  /** The document after the change. */
  readonly doc: ProseMirrorNode;
}

type Kinds = Readonly<Record<string, ContentsKind>>;

// What the kinds read: the node types they list, and the marks and inline node types inside text.
function readTypes(kinds: Kinds) {
  const nodes = new Set<string>();
  const marks = new Set<string>();
  for (const kind of Object.values(kinds)) {
    for (const name of kind.nodes) nodes.add(name);
    for (const name of kind.marks ?? []) marks.add(name);
  }
  return { nodes, marks };
}

// Whether a textblock holds a listed mark or a listed inline node.
function holdsListed(block: ProseMirrorNode, { nodes, marks }: ReturnType<typeof readTypes>) {
  let found = false;
  block.descendants((child) => {
    if (found) return false;
    if (nodes.has(child.type.name) || child.marks.some((mark) => marks.has(mark.type.name))) {
      found = true;
    }
    return !found;
  });
  return found;
}

// The textblock a step edits inside, by the position of its start in the document after the step,
// or null for a step that changes anything else.
function editedBlock(step: Step, before: ProseMirrorNode, after: ProseMirrorNode) {
  if (!(step instanceof ReplaceStep)) return null;
  if (step.slice.openStart !== 0 || step.slice.openEnd !== 0) return null;
  let inline = true;
  step.slice.content.forEach((node) => {
    if (!node.isInline) inline = false;
  });
  if (!inline) return null;
  const $from = before.resolve(step.from);
  if (!$from.parent.isTextblock || !$from.sameParent(before.resolve(step.to))) return null;
  const start = $from.before();
  const block = after.nodeAt(start);
  return block?.isTextblock ? { $from, block, start } : null;
}

// Whether a block's ancestors, apart from the document's sections and pages, are listed.
// A table's caption is in the `table_figure` holding the table, which is listed with it.
function underListed($from: ResolvedPos, nodes: ReadonlySet<string>) {
  for (let depth = 1; depth < $from.depth; depth += 1) {
    const name = $from.node(depth).type.name;
    if (nodes.has(name) || (name === 'table_figure' && nodes.has('table'))) return true;
  }
  return false;
}

// Gives a listed block's entries the text it has after the edit; false when the edit could change
// more than their text: whether it is listed, its level, or where a sorted or unique kind puts it.
function retexted(
  catalog: Record<string, CatalogEntry[]>,
  kinds: Kinds,
  { block, pos }: { block: ProseMirrorNode; pos: number },
): boolean {
  for (const [key, kind] of Object.entries(kinds)) {
    if (!kind.nodes.includes(block.type.name)) continue;
    const entries = catalog[key] ?? [];
    const index = entries.findIndex((entry) => entry.pos === pos);
    if (index < 0) {
      // A block a kind chooses by its content may be chosen now.
      if (kind.include?.(block)) return false;
      continue;
    }
    if (kind.unique || kind.sort || kind.include?.(block) === false) return false;
    const entry = entries[index] as CatalogEntry;
    const next = nodeEntry([key, kind], [block, pos, entry.number], entry.page);
    if (next.level !== entry.level) return false;
    entries[index] = next;
  }
  return true;
}

/**
 * The catalog after a change, derived from the one before it, or null when the change has to be
 * counted again: a change that is not only an edit of inline content inside one textblock, or one
 * in a block that holds a listed mark or inline node before or after it, sits in a listed block, or
 * changes more than a listed block's text. A kind that does not list the edited block type keeps
 * every entry, moved by the edit.
 */
export function deriveCatalog(
  catalog: DocumentCatalog,
  change: CatalogChange,
  kinds: Kinds,
): DocumentCatalog | null {
  const types = readTypes(kinds);
  const edited: number[] = [];
  for (const [index, step] of change.steps.entries()) {
    const before = change.docs[index];
    const after = change.docs[index + 1] ?? change.doc;
    if (!before) return null;
    const found = editedBlock(step, before, after);
    if (!found || underListed(found.$from, types.nodes)) return null;
    if (holdsListed(found.$from.parent, types) || holdsListed(found.block, types)) return null;
    // The block's start, carried through the steps after this one.
    edited.push(change.mapping.slice(index + 1).map(found.start));
  }
  const mapped: Record<string, CatalogEntry[]> = Object.fromEntries(
    Object.entries(catalog).map(([key, entries]) => [
      key,
      entries.map((entry) => ({ ...entry, pos: change.mapping.map(entry.pos) })),
    ]),
  );
  for (const pos of new Set(edited)) {
    const block = change.doc.nodeAt(pos);
    if (!block || (types.nodes.has(block.type.name) && !retexted(mapped, kinds, { block, pos }))) {
      return null;
    }
  }
  return mapped;
}
