// The automation API: how an agent or a script changes a live document by element id, as one change
// the writer can undo, directly or as suggestions, attributed to who made it. A batch is checked
// whole before it is handed back: an element that is gone, a range whose text is no longer what the
// caller read, or a locked position refuses it.

import type { Node as ProseMirrorNode, Schema } from 'prosemirror-model';
import { type EditorState, PluginKey, type Transaction } from 'prosemirror-state';
import { isEmbed, readStoredContent, type StoredNode } from '../model/index.js';
import { identityAttributesOf } from '../model/schema/element-attributes.js';
import {
  type EditAddress,
  type FoundElement,
  textOf,
  textRange,
  wholeElement,
} from './automation-address.js';
import { anchorCommentRanges } from './comments.js';
import { isLockedIn } from './edit-lock.js';
import { createElementId } from './element-ids.js';
import { isHostContentAt } from './host-content.js';
import { suggestTransaction } from './suggestions.js';

/** Who makes a change. */
export interface Actor {
  readonly id: string;
  readonly kind: 'human' | 'agent' | 'system';
  /** The agent's session, recorded with what it writes. */
  readonly session?: string | undefined;
}

/** One change of a batch. */
export type AutomationEdit =
  | { readonly op: 'insertText'; readonly at: EditAddress; readonly text: string }
  | { readonly op: 'replaceText'; readonly at: EditAddress; readonly text: string }
  | { readonly op: 'deleteText'; readonly at: EditAddress }
  | { readonly op: 'comment'; readonly at: EditAddress; readonly text: string }
  | {
      readonly op: 'insertBlocks';
      readonly before?: string | undefined;
      readonly after?: string | undefined;
      readonly content: readonly StoredNode[];
    }
  | {
      readonly op: 'replaceBlock';
      readonly elementId: string;
      readonly content: readonly StoredNode[];
    }
  | { readonly op: 'deleteBlock'; readonly elementId: string }
  | {
      readonly op: 'setAttrs';
      readonly elementId: string;
      readonly attrs: Readonly<Record<string, unknown>>;
    };

/** How a batch is made. */
export interface AutomationOptions {
  readonly actor: Actor;
  /** `direct` changes the document; `suggest` records the changes as suggestions by the actor. */
  readonly mode: 'direct' | 'suggest';
  /** Makes fresh ids for comment threads and suggestions; random by default. */
  readonly newId?: (() => string) | undefined;
}

/** Why an edit was refused. */
export type AutomationErrorKind = 'not-found' | 'stale' | 'locked' | 'invalid' | 'unsupported';

/** Why a batch was refused, and which edit refused it. */
export interface AutomationError {
  readonly kind: AutomationErrorKind;
  readonly index: number;
  readonly message: string;
}

/** A comment thread a batch anchored, for the host to store. */
export interface CreatedThread {
  readonly id: string;
  readonly quote: string;
  readonly text: string;
  readonly actor: Actor;
}

export type AutomationResult =
  | { readonly ok: true; readonly tr: Transaction; readonly threads: readonly CreatedThread[] }
  | { readonly ok: false; readonly error: AutomationError };

/** Marks the transactions the automation API makes, with their actor. */
export const automationKey = new PluginKey<Actor>('automation');

/** The actor of a transaction the automation API made, or null. */
export function automationActor(tr: Transaction): Actor | null {
  return (tr.getMeta(automationKey) as Actor | undefined) ?? null;
}

interface Refusal {
  readonly kind: AutomationErrorKind;
  readonly message: string;
}

const refuse = (kind: AutomationErrorKind, message: string): Refusal => ({ kind, message });

interface Batch {
  readonly state: EditorState;
  readonly tr: Transaction;
  readonly options: AutomationOptions;
  readonly threads: CreatedThread[];
}

const element = (tr: Transaction, id: string): FoundElement | Refusal =>
  wholeElement(tr, id) ?? refuse('not-found', `No element ${id}`);

const isRefusal = (value: object): value is Refusal => 'kind' in value && 'message' in value;

function lockedAt({ state, tr }: Batch, from: number, to: number): Refusal | null {
  const locked =
    isLockedIn(state, tr.doc, from) || isLockedIn(state, tr.doc, Math.max(from, to - 1));
  return locked ? refuse('locked', 'The position is locked') : null;
}

// Refuses a change at a position inside an embed or a script's output: the plugins keeping that
// content would drop the whole batch once dispatched, while the caller was told it applied.
const hostOwnedAt = (tr: Transaction, pos: number): Refusal | null =>
  isHostContentAt(tr.doc, pos) ? refuse('locked', 'The content there is not the writer’s') : null;

// The range an address names in its text block, checked against what the caller read.
function range(batch: Batch, at: EditAddress) {
  const block = element(batch.tr, at.elementId);
  if (isRefusal(block)) return block;
  if (!block.node.isTextblock) return refuse('invalid', `${at.elementId} holds no text`);
  const found = textRange(block, at);
  if (!found) return refuse('invalid', `The range is outside ${at.elementId}`);
  if (at.expect !== undefined && found.text !== at.expect) {
    return refuse('stale', `${at.elementId} no longer reads "${at.expect}" there`);
  }
  return lockedAt(batch, found.from, found.to) ?? found;
}

// The marks the actor's text carries: who wrote it, when the actor is not a person.
function writtenBy(schema: Schema, actor: Actor) {
  const contributor = schema.marks.contributor;
  if (!contributor || actor.kind === 'human') return [];
  return [contributor.create({ dataAuthor: actor.id, dataAiSession: actor.session ?? null })];
}

// Stored blocks as the actor's: each attributed to it.
function blocks(schema: Schema, content: readonly StoredNode[], actor: Actor) {
  let nodes: ProseMirrorNode[];
  try {
    nodes = readStoredContent(content, schema);
  } catch (error) {
    return refuse('invalid', error instanceof Error ? error.message : 'Unreadable content');
  }
  return nodes.map((node) =>
    'dataAuthor' in node.attrs
      ? node.type.create(
          { ...node.attrs, dataAuthor: actor.id, dataAiSession: actor.session ?? null },
          node.content,
          node.marks,
        )
      : node,
  );
}

type TextEdit = Extract<AutomationEdit, { at: EditAddress }>;

// The empty range an insertion goes in: at its offset, or the end of the element's text.
function insertionPoint(tr: Transaction, at: EditAddress): EditAddress {
  if (at.from !== undefined) return { ...at, to: at.from };
  const block = wholeElement(tr, at.elementId);
  const end = block?.node.isTextblock ? textOf(block).text.length : 0;
  return { ...at, from: end, to: end };
}

function applyText(batch: Batch, edit: TextEdit): Refusal | null {
  const { tr, state, options } = batch;
  const found = range(batch, edit.op === 'insertText' ? insertionPoint(tr, edit.at) : edit.at);
  if (isRefusal(found)) return found;
  if (edit.op === 'comment') {
    const id = (options.newId ?? createElementId)();
    if (!anchorCommentRanges(tr, { thread: id, ranges: [found] }, { newId: options.newId })) {
      return refuse('invalid', 'Nothing to comment on');
    }
    batch.threads.push({ id, quote: found.text, text: edit.text, actor: options.actor });
    return null;
  }
  const owned = hostOwnedAt(tr, found.from);
  if (owned) return owned;
  if (edit.op === 'deleteText' || !edit.text) {
    tr.delete(found.from, found.to);
    return null;
  }
  // The actor's mark takes the place of the contributor mark the text there carries: the mark
  // excludes itself, and a document holding two on one text no longer reads back.
  const marks = writtenBy(state.schema, options.actor).reduce(
    (set, mark) => mark.addToSet(set),
    tr.doc.resolve(found.from).marks(),
  );
  tr.replaceWith(found.from, found.to, state.schema.text(edit.text, marks));
  return null;
}

function insertBlocks(batch: Batch, edit: Extract<AutomationEdit, { op: 'insertBlocks' }>) {
  const anchor = edit.after ?? edit.before;
  if (!anchor) return refuse('invalid', 'Insert before or after an element');
  const found = element(batch.tr, anchor);
  if (isRefusal(found)) return found;
  const pos = edit.after ? found.pos + found.node.nodeSize : found.pos;
  const nodes = blocks(batch.state.schema, edit.content, batch.options.actor);
  if (isRefusal(nodes)) return nodes;
  const locked =
    lockedAt(batch, found.pos + 1, found.pos + found.node.nodeSize - 1) ??
    hostOwnedAt(batch.tr, pos);
  if (locked) return locked;
  batch.tr.insert(pos, nodes);
  return null;
}

type BlockEdit = Extract<AutomationEdit, { op: 'replaceBlock' | 'deleteBlock' | 'setAttrs' }>;

// A table's caption has an id of its own, kept on the table.
const CAPTION_ID = 'captionDataId';

// Why attributes may not be set on an element: one says which element it is, which comments,
// references and later edits find it by, or its type does not define it.
function refusedAttrs(node: ProseMirrorNode, attrs: Readonly<Record<string, unknown>>) {
  const identity = new Set(identityAttributesOf(node.type).map(({ name }) => name));
  const defined = node.type.spec.attrs ?? {};
  const name = Object.keys(attrs).find(
    (each) => each === CAPTION_ID || identity.has(each) || !(each in defined),
  );
  return name === undefined ? null : refuse('invalid', `${name} cannot be set on an element`);
}

function changeBlock(batch: Batch, edit: BlockEdit): Refusal | null {
  const { tr } = batch;
  const found = element(tr, edit.elementId);
  if (isRefusal(found)) return found;
  const end = found.pos + found.node.nodeSize;
  // A whole embed may be replaced or deleted, but its attributes are the host's, as its content is.
  const changed = edit.op === 'setAttrs' && isEmbed(found.node) ? found.pos + 1 : found.pos;
  const locked = lockedAt(batch, found.pos + 1, end - 1) ?? hostOwnedAt(tr, changed);
  if (locked) return locked;
  if (edit.op === 'setAttrs') {
    const refused = refusedAttrs(found.node, edit.attrs);
    if (refused) return refused;
    tr.setNodeMarkup(found.pos, undefined, { ...found.node.attrs, ...edit.attrs });
  } else if (edit.op === 'deleteBlock') {
    tr.delete(found.pos, end);
  } else {
    const nodes = blocks(batch.state.schema, edit.content, batch.options.actor);
    if (isRefusal(nodes)) return nodes;
    tr.replaceWith(found.pos, end, nodes);
  }
  return null;
}

function applyEdit(batch: Batch, edit: AutomationEdit): Refusal | null {
  if ('at' in edit) return applyText(batch, edit);
  if (edit.op === 'insertBlocks') return insertBlocks(batch, edit);
  return changeBlock(batch, edit);
}

/**
 * Makes a batch of edits to a state as one change, by element id: refused whole, naming the first
 * edit that could not be made, when an element is gone, a range no longer holds the text the
 * caller read, a position is locked or a suggestion cannot record the change. Dispatch the
 * transaction on the editor's view; anchored comment threads come back for the host to store.
 */
export function applyEdits(
  state: EditorState,
  edits: readonly AutomationEdit[],
  options: AutomationOptions,
): AutomationResult {
  const batch: Batch = { state, tr: state.tr, options, threads: [] };
  for (const [index, edit] of edits.entries()) {
    const refused = applyEdit(batch, edit);
    if (refused) return { ok: false, error: { ...refused, index } };
  }
  const tr = batch.tr.setMeta(automationKey, options.actor);
  if (options.mode === 'direct')
    return { ok: true, tr: tr.scrollIntoView(), threads: batch.threads };
  const suggested = suggestTransaction(tr, state, {
    author: options.actor.id,
    ...(options.newId ? { newId: options.newId } : {}),
  });
  if (!suggested) {
    const error = { kind: 'unsupported', index: 0, message: 'A suggestion cannot record this' };
    return { ok: false, error: error as AutomationError };
  }
  return {
    ok: true,
    tr: suggested.setMeta(automationKey, options.actor).scrollIntoView(),
    threads: batch.threads,
  };
}
