// Keeps every element of a document's content identified: after a local change, each element
// without an id, or with an id an earlier element already holds, gets a fresh one, and the elements
// a local change adds are attributed to the writer. Page chrome is view content and is left as it
// is.

import { Fragment, type Node as ProseMirrorNode, Slice } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { AddMarkStep, RemoveMarkStep, ReplaceStep, type Step } from 'prosemirror-transform';
import { isStructureNode, regionKind } from '../model/index.js';
import { clearIdentityAttrs } from '../model/schema/element-attributes.js';
import { markContributors } from './provenance.js';

/** What an element id looks like: eight lower-case hexadecimal digits. */
export const ELEMENT_ID_PATTERN = /^[a-f0-9]{8}$/;

/** A fresh random element id. */
export function createElementId(): string {
  const [value = 0] = crypto.getRandomValues(new Uint32Array(1));
  return value.toString(16).padStart(8, '0');
}

/** How an editor identifies its elements. */
export interface ElementIdsOptions {
  /** The writer the elements a local change adds are attributed to, or null for none. */
  author?: (() => string | null) | undefined;
  /** Whether a transaction came from elsewhere, such as a collaborator or the server. */
  isRemote?: ((tr: Transaction) => boolean) | undefined;
  /** Makes a fresh id; random by default. */
  newId?: (() => string) | undefined;
}

// The regions the pagination draws from the template and the footnotes, which hold no stored
// elements; sections, pages and the content are structure around the elements.
const isDrawnRegion = (node: ProseMirrorNode) => {
  const kind = regionKind(node);
  return kind !== null && kind !== 'content';
};

// A step that only changes text or marks inside text blocks, which adds no element: an inline atom,
// such as a mention or an equation, is an element of its own.
function isTextStep(step: Step): boolean {
  if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) return true;
  if (!(step instanceof ReplaceStep)) return false;
  let text = true;
  step.slice.content.forEach((node) => {
    if (!node.isText) text = false;
  });
  return text;
}

/**
 * Gives each element without a valid id, or with one an earlier element holds, a fresh id, and
 * returns whether it changed the document. Elements that get one are attributed to `author` when
 * they have no author, or when they copied another element's id, as a split does.
 */
export function assignElementIds(
  tr: Transaction,
  { author = null, newId = createElementId }: AssignOptions,
): boolean {
  const walk: Walk = { tr, seen: new Set(), author, newId, changed: false };
  tr.doc.descendants((node, pos) => {
    if (node.isText || isDrawnRegion(node)) return false;
    if (!isStructureNode(node)) identify(walk, node, pos);
    return true;
  });
  return walk.changed;
}

/** How `assignElementIds` attributes and makes ids. */
interface AssignOptions {
  author?: string | null | undefined;
  newId?: (() => string) | undefined;
}

// The state of one walk: the ids met so far.
interface Walk {
  readonly tr: Transaction;
  readonly seen: Set<string>;
  readonly author: string | null;
  readonly newId: () => string;
  changed: boolean;
}

// Keeps an element's id when it is valid and its own, or gives it a fresh one.
function identify(walk: Walk, node: ProseMirrorNode, pos: number): void {
  const id: unknown = node.attrs.dataId;
  const valid = typeof id === 'string' && ELEMENT_ID_PATTERN.test(id);
  const copied = valid && walk.seen.has(id);
  if (valid && !copied) {
    walk.seen.add(id);
    return;
  }
  let fresh = walk.newId();
  while (walk.seen.has(fresh)) fresh = walk.newId();
  walk.seen.add(fresh);
  walk.tr.setNodeMarkup(pos, null, {
    ...node.attrs,
    dataId: fresh,
    dataAuthor: copied || !node.attrs.dataAuthor ? walk.author : node.attrs.dataAuthor,
    dataAiSession: copied ? null : node.attrs.dataAiSession,
  });
  walk.changed = true;
}

const elementIdsKey = new PluginKey('element-ids');

/**
 * Keeps the elements of a document identified after each local change, and the text it inserts
 * marked as its writer's (`markContributors`). Changes that stay out of the history, such as the
 * pagination's, and changes from elsewhere are left as they are, and changes that only edit text
 * are given no ids.
 */
export function createElementIds({
  author = () => null,
  isRemote: remote,
  newId,
}: ElementIdsOptions = {}): Plugin {
  const isRemote = remote ?? (() => false);
  const contributor = () => {
    const id = author();
    return id ? { author: id } : null;
  };
  const isLocalEdit = (tr: Transaction) =>
    tr.docChanged && tr.getMeta('addToHistory') !== false && !isRemote(tr);
  return new Plugin({
    key: elementIdsKey,
    appendTransaction(transactions, _before, after) {
      const tr = after.tr;
      const marked = markContributors(tr, transactions, { contributor, isRemote: remote });
      const edits = transactions.filter(isLocalEdit);
      if (edits.every((each) => each.steps.every(isTextStep))) return marked ? tr : null;
      return assignElementIds(tr, { author: author(), newId }) || marked ? tr : null;
    },
  });
}

/** Marks the change that repairs a document's element ids when it opens. */
export const ELEMENT_IDS_REPAIR = 'elementIdsRepair';

/** How `repairElementIds` repairs a document. */
export interface RepairElementIdsOptions {
  /** The writer the repaired elements without one are attributed to, such as a system account. */
  readonly author?: string | null | undefined;
  /** Makes a fresh id; random by default. */
  readonly newId?: (() => string) | undefined;
}

/**
 * The change that gives a document opened with missing, invalid or repeated element ids valid ones,
 * out of the undo history; null when every element already has one. A server can run it on a
 * stored document too.
 */
export function repairElementIds(
  state: EditorState,
  options: RepairElementIdsOptions = {},
): Transaction | null {
  const tr = state.tr;
  if (!assignElementIds(tr, options)) return null;
  return tr.setMeta('addToHistory', false).setMeta(ELEMENT_IDS_REPAIR, true);
}

// A node as a new copy: its own identity cleared, and its contributors' marks on its text removed.
function copyOf(node: ProseMirrorNode): ProseMirrorNode {
  if (node.isText) {
    const marks = node.marks.filter((mark) => mark.type.name !== 'contributor');
    return marks.length === node.marks.length ? node : node.mark(marks);
  }
  return node.type.create(
    clearIdentityAttrs(node.type, node.attrs),
    copiesOf(node.content),
    node.marks,
  );
}

function copiesOf(fragment: Fragment): Fragment {
  const nodes: ProseMirrorNode[] = [];
  fragment.forEach((node) => nodes.push(copyOf(node)));
  return Fragment.fromArray(nodes);
}

/**
 * Pasted content as new elements: every element's identity attributes that a copy clears are
 * cleared (DOCE-SCHEMA-2.3), and the contributor marks on its text removed, so the element ids give
 * the copy fresh ids and attribute it to its paster, and the original keeps its own. Content moved
 * by dragging it within the document is the same content, and keeps its identity.
 */
export function clearCopiedIdentity(slice: Slice): Slice {
  return new Slice(copiesOf(slice.content), slice.openStart, slice.openEnd);
}
