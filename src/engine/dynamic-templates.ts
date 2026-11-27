// Template blocks (`dynamic_template`): a block that holds, as its own blocks, what its markup
// renders with the texts the document stores (DOCE-TEMPLATES-9.1), so the pages lay out stored
// content and nothing is asked of the host or the clock as they do. Each editor that edits
// directly renders a block again after a change to the stored texts or to the block, its own or
// not, and once its view opens. A render only deletes, or inserts into a block that holds nothing,
// so renders meet whole in a room, and the room settles to one copy with whoever is in it; an
// editor whose renders another editor keeps taking back leaves the room's and says so.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { changedNodes } from '../utils/changed-ranges.js';
import { isWritersChange } from './edit-lock.js';
import { sameOutputContent } from './script-output.js';
import {
  holdsOtherRender,
  keepOnly,
  renderedAt,
  renderedContent,
  renderInput,
} from './template-block-render.js';
import { isInlineTextOnly, markDerived } from './transaction-kind.js';

/** Marks a transaction that renders the template blocks, which may change what they hold. */
export const dynamicTemplatesKey = new PluginKey('dynamic-templates');

// Whether a change may change what a template block shows: it sets the stored texts, or it adds a
// template block or changes one's markup, keys or blocks. The writer's own typing does neither.
function changesTemplates(tr: Transaction): boolean {
  if (!tr.docChanged || tr.getMeta(dynamicTemplatesKey)) return false;
  if (setsTexts(tr)) return true;
  if (isWritersChange(tr) && isInlineTextOnly(tr)) return false;
  let found = false;
  changedNodes(tr.doc, [tr], (node) => {
    found ||= node.type.name === 'dynamic_template';
    return !found && !node.isTextblock;
  });
  return found;
}

const setsTexts = (tr: Transaction) => tr.before.attrs.values !== tr.doc.attrs.values;

// Whether a writer's change edits what a template block holds, rather than adding, moving or
// deleting whole blocks or changing their markup: a block still there whose content differs.
function editsOutput(tr: Transaction): boolean {
  let edited = false;
  const back = tr.mapping.invert();
  changedNodes(tr.doc, [tr], (after, pos) => {
    if (edited) return false;
    if (after.type.name !== 'dynamic_template') return !after.isTextblock;
    const mapped = back.mapResult(pos, 1);
    const node = mapped.deletedAfter ? null : tr.before.nodeAt(mapped.pos);
    edited = node?.type === after.type && !sameOutputContent(node.content, after.content);
    return false;
  });
  return edited;
}

/** When a template block is rendered again. */
export interface DynamicTemplatesOptions {
  /** Whether this editor renders template blocks; false while reading or suggesting. */
  readonly enabled?: (() => boolean) | undefined;
  /**
   * Told once for a block, by its element id, when its renders keep being taken back by another
   * editor's, as by an editor that reads the markup otherwise: this editor then leaves what the
   * room holds, while it holds anything.
   */
  readonly onUnsettled?: ((blockId: string) => void) | undefined;
}

// How many times an editor deletes, for one markup and texts, a render another editor made of
// them otherwise, before it leaves what the block holds: an ordinary race deletes none.
const ANSWERS = 1;

// What an editor remembers of its answers: for each block, the input it answers for and how many
// times it deleted another editor's render of it, and the blocks it told of.
interface Renders {
  readonly answers: Map<string, { input: string; count: number }>;
  readonly told: Set<string>;
  readonly onUnsettled?: ((blockId: string) => void) | undefined;
}

const blockId = (node: ProseMirrorNode, pos: number) =>
  typeof node.attrs.dataId === 'string' && node.attrs.dataId
    ? node.attrs.dataId
    : `@${String(pos)}`;

// Whether an editor may delete another editor's render once more; told once when it may not, as it
// leaves what the block holds.
function mayAnswer(id: string, input: string, renders: Renders): boolean {
  const count = renders.answers.get(id)?.count ?? 0;
  if (count < ANSWERS) {
    renders.answers.set(id, { input, count: count + 1 });
    return true;
  }
  const key = `${id}\n${input}`;
  if (!renders.told.has(key)) {
    renders.told.add(key);
    renders.onUnsettled?.(id);
  }
  return false;
}

// Brings one block towards what it renders: deletes only, when the render stands whole beside
// other blocks or the block holds something else, and inserts only into a block that holds
// nothing, so whole renders meet in a room and the room settles to one copy. Whether it changed
// the block, and whether it emptied it to fill it after.
function renderBlock(
  tr: Transaction,
  at: { pos: number; node: ProseMirrorNode; owner: Document },
  { own, renders }: { own: boolean; renders: Renders },
): 'same' | 'changed' | 'emptied' {
  const { pos, node, owner } = at;
  const id = blockId(node, pos);
  const input = renderInput(node, tr.doc);
  // Answers are counted for one markup and texts: new ones, or the writer's own render, start over.
  if (own || renders.answers.get(id)?.input !== input) renders.answers.delete(id);
  const content = renderedContent(node, tr.doc, owner);
  if (sameOutputContent(node.content, content)) return 'same';
  // A block that holds nothing is always filled, so no answer leaves it empty.
  if (node.childCount === 0) {
    tr.insert(pos + 1, content);
    return 'changed';
  }
  const answer = !own && holdsOtherRender(node, tr.doc, content);
  if (answer && !mayAnswer(id, input, renders)) return 'same';
  const start = renderedAt(node, content);
  if (start >= 0) {
    keepOnly(tr, { pos, node }, [start, content.childCount]);
    return 'changed';
  }
  tr.delete(pos + 1, pos + node.nodeSize - 1);
  return 'emptied';
}

// Renders the blocks of a state's document; the change, if any, and whether a block was emptied to
// be filled after.
function renderAll(state: EditorState, owner: Document, how: { own: boolean; renders: Renders }) {
  const tr = state.tr;
  const found: { pos: number; node: ProseMirrorNode }[] = [];
  tr.doc.descendants((node, pos) => {
    if (node.type.name !== 'dynamic_template') return !node.isTextblock;
    found.push({ pos, node });
    return false;
  });
  let emptied = false;
  for (const { pos, node } of found.reverse()) {
    emptied = renderBlock(tr, { pos, node, owner }, how) === 'emptied' || emptied;
  }
  if (!tr.docChanged) return { tr: null, emptied };
  // Derived, out of the history and off a room's undo stack, so undo and redo take back the change
  // and this renders again, and no writer is credited with what the document renders.
  return { tr: markDerived(tr.setMeta(dynamicTemplatesKey, true)), emptied };
}

/**
 * Renders the template blocks after any change to the stored texts or to a template block, the
 * writer's own, another writer's, a server's or a replayed one, and once a view opens, wherever a
 * block holds anything but what it renders, out of the history, and refuses the writer's own
 * changes inside what a block holds.
 */
export function createDynamicTemplates({
  enabled,
  onUnsettled,
}: DynamicTemplatesOptions = {}): Plugin {
  let current: EditorView | null = null;
  const renders: Renders = { answers: new Map(), told: new Set(), onUnsettled };
  const run = (state: EditorState, own: boolean) => {
    const owner = current?.dom.ownerDocument;
    if (!owner || enabled?.() === false) return null;
    const { tr, emptied } = renderAll(state, owner, { own, renders });
    if (emptied) queueMicrotask(dispatchRender);
    return tr;
  };
  // Renders in a transaction of its own: to fill a block emptied before, or once a view opens.
  const dispatchRender = () => {
    const view = current;
    if (!view || view.isDestroyed) return;
    const tr = run(view.state, false);
    if (tr) view.dispatch(tr);
  };
  return new Plugin({
    key: dynamicTemplatesKey,
    view(view) {
      current = view;
      // A document opened with a block that holds anything else, such as one composed from a
      // template whose texts it already stores, is rendered once its view opens.
      queueMicrotask(dispatchRender);
      return {
        destroy: () => {
          if (current === view) current = null;
        },
      };
    },
    // The writer's own changes may not edit what a block holds; rendering, undo and redo may.
    filterTransaction: (tr) =>
      !isWritersChange(tr) ||
      Boolean(tr.getMeta(dynamicTemplatesKey) || tr.getMeta('history$')) ||
      !editsOutput(tr),
    appendTransaction(transactions, _old, state) {
      if (!transactions.some(changesTemplates)) return null;
      return run(state, transactions.some(isWritersChange));
    },
  });
}
