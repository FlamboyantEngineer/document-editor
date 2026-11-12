// Keeps every element of a document's content identified: after a local change, each element
// without an id, or with an id an earlier element already holds, gets a fresh one, and the elements
// a local change adds are attributed to the writer. The parts a split element is laid out in share
// its id. Page chrome is view content and is left as it is.

import { Fragment, type Node as ProseMirrorNode, Slice } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { AddMarkStep, RemoveMarkStep, ReplaceStep, type Step } from 'prosemirror-transform';
import { clearIdentityAttrs } from '../model/schema/element-attributes.js';

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

/** Page chrome: view content the pagination draws, which holds no stored elements. */
const CHROME = new Set(['page_section', 'page', 'page_content']);
const DRAWN = new Set(['page_header', 'page_footer', 'page_footnotes']);

const isSplitPart = (node: ProseMirrorNode) =>
  node.attrs.splitPartIndex !== null && node.attrs.splitPartIndex !== undefined;

// The empty paragraph a list item's later part opens with when the pagination splits it.
const isPlaceholder = (node: ProseMirrorNode, parent: ProseMirrorNode | null) =>
  parent?.type.name === 'list_item' &&
  parent.firstChild === node &&
  isSplitPart(parent) &&
  node.type.name === 'paragraph' &&
  node.content.size === 0 &&
  !node.attrs.dataId;

// A header row a later part of a split table repeats: one of the header rows it leads with.
function isRepeatedHeaderRow(node: ProseMirrorNode, parent: ProseMirrorNode | null): boolean {
  if (!parent || parent.type.spec.tableRole !== 'table' || !isSplitPart(parent)) return false;
  if (Number(parent.attrs.splitPartIndex) === 0 || node.type.spec.tableRole !== 'row') return false;
  let leading = true;
  let found = false;
  parent.forEach((row) => {
    if (!leading || found) return;
    const header =
      row.childCount > 0 &&
      row.content.content.every((cell) => cell.type.spec.tableRole === 'header_cell');
    if (!header) leading = false;
    else if (row === node) found = true;
  });
  return found;
}

// A step that only changes text or marks inside text blocks, which adds no element.
function isTextStep(step: Step): boolean {
  if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) return true;
  if (!(step instanceof ReplaceStep)) return false;
  let inline = true;
  step.slice.content.descendants((node) => {
    if (!node.isInline) inline = false;
    return inline;
  });
  return inline;
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
  const walk: Walk = { tr, seen: new Map(), author, newId, changed: false };
  tr.doc.descendants((node, pos, parent) => {
    if (node.isText || DRAWN.has(node.type.name)) return false;
    // The header rows a later part of a split table repeats are copies of the first part's.
    if (isRepeatedHeaderRow(node, parent)) return false;
    if (!CHROME.has(node.type.name) && !isPlaceholder(node, parent)) identify(walk, node, pos);
    return true;
  });
  return walk.changed;
}

/** How `assignElementIds` attributes and makes ids. */
interface AssignOptions {
  author?: string | null | undefined;
  newId?: (() => string) | undefined;
}

// The state of one walk: the ids met so far, each with whether a split part held it.
interface Walk {
  readonly tr: Transaction;
  readonly seen: Map<string, boolean>;
  readonly author: string | null;
  readonly newId: () => string;
  changed: boolean;
}

// Keeps an element's id when it is valid and its own, or a split part's of the same element, or
// gives it a fresh one.
function identify(walk: Walk, node: ProseMirrorNode, pos: number): void {
  const id: unknown = node.attrs.dataId;
  const splitPart = isSplitPart(node);
  const earlier = typeof id === 'string' ? walk.seen.get(id) : undefined;
  const valid = typeof id === 'string' && ELEMENT_ID_PATTERN.test(id);
  if (valid && earlier === undefined) walk.seen.set(id, splitPart);
  if (valid && (earlier === undefined || (earlier && splitPart))) return;
  let fresh = walk.newId();
  while (walk.seen.has(fresh)) fresh = walk.newId();
  walk.seen.set(fresh, splitPart);
  const copied = valid && earlier !== undefined;
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
 * Keeps the elements of a document identified after each local change. Changes that stay out of
 * the history, such as the pagination's, and changes from elsewhere are left as they are, and so
 * are changes that only edit text.
 */
export function createElementIds({
  author = () => null,
  isRemote = () => false,
  newId,
}: ElementIdsOptions = {}): Plugin {
  const isLocalEdit = (tr: Transaction) =>
    tr.docChanged && tr.getMeta('addToHistory') !== false && !isRemote(tr);
  return new Plugin({
    key: elementIdsKey,
    appendTransaction(transactions, _before, after) {
      const edits = transactions.filter(isLocalEdit);
      if (edits.every((tr) => tr.steps.every(isTextStep))) return null;
      const tr = after.tr;
      return assignElementIds(tr, { author: author(), newId }) ? tr : null;
    },
  });
}

/** Marks the change that repairs a document's element ids when it opens. */
export const ELEMENT_IDS_REPAIR = 'elementIdsRepair';

/**
 * The change that gives a document opened with missing, invalid or repeated element ids valid ones,
 * out of the undo history; null when every element already has one. A server can run it on a
 * stored document too.
 */
export function repairElementIds(
  state: EditorState,
  options: { readonly newId?: (() => string) | undefined } = {},
): Transaction | null {
  const tr = state.tr;
  if (!assignElementIds(tr, { newId: options.newId })) return null;
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
