// Template blocks (`dynamic_template`): a block that holds, as its own blocks, what its markup
// renders with the texts the document stores (DOCE-TEMPLATES-9.1), so the pages lay out stored
// content and nothing is asked of the host or the clock as they do. Each editor that edits
// directly renders a block again after a change to the stored texts or to the block, its own or
// not. In a room, an answer to someone else's change only deletes, or inserts into a block that
// holds nothing, so two editors who answer at once settle on one copy; and an editor whose render
// another editor's change replaced, with the same markup and texts, leaves the room's and says so.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { changedNodes } from '../utils/changed-ranges.js';
import { isWritersChange } from './edit-lock.js';
import { sameOutputContent } from './script-output.js';
import { keepOnly, renderedAt, renderedContent, renderInput } from './template-block-render.js';
import { isInlineTextOnly } from './transaction-kind.js';

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
   * Told once for a block, by its element id, when another editor's change replaced this editor's
   * render with something else from the same markup and texts, as an editor that reads the markup
   * otherwise does; this editor then leaves what the room holds.
   */
  readonly onUnsettled?: ((blockId: string) => void) | undefined;
}

// How an editor comes to render: after its writer's own change, after another change (`texts`
// when it set the stored texts), when its view opens, or to finish an answer it began.
type Occasion = 'own' | 'other' | 'texts' | 'open' | 'finish';

// What an editor remembers of its renders: for each block, what it last rendered it from.
interface Renders {
  readonly held: Map<string, string>;
  readonly told: Set<string>;
  readonly onUnsettled?: ((blockId: string) => void) | undefined;
}

const blockId = (node: ProseMirrorNode, pos: number) =>
  typeof node.attrs.dataId === 'string' && node.attrs.dataId
    ? node.attrs.dataId
    : `@${String(pos)}`;

// Brings one block towards what it renders, by the occasion; whether it changed it, and whether
// it emptied it to fill it later.
function renderBlock(
  tr: Transaction,
  at: { pos: number; node: ProseMirrorNode; owner: Document },
  { occasion, renders }: { occasion: Occasion; renders: Renders },
): 'same' | 'changed' | 'emptied' {
  const { pos, node, owner } = at;
  const content = renderedContent(node, tr.doc, owner);
  const input = renderInput(node, tr.doc);
  const id = blockId(node, pos);
  if (sameOutputContent(node.content, content)) {
    renders.held.set(id, input);
    return 'same';
  }
  const start = renderedAt(node, content);
  if (start >= 0) {
    keepOnly(tr, { pos, node }, [start, content.childCount]);
  } else if (occasion === 'own') {
    tr.replaceWith(pos + 1, pos + node.nodeSize - 1, content);
  } else if (occasion === 'other' && renders.held.get(id) === input) {
    // Another editor put back something else for the same markup and texts: leave the room's.
    if (!renders.told.has(`${id}\n${input}`)) {
      renders.told.add(`${id}\n${input}`);
      renders.onUnsettled?.(id);
    }
    return 'same';
  } else if (node.childCount > 0) {
    // An answer empties the block first and fills it after, so two editors answering at once
    // delete the same blocks and insert whole ones, which the room settles to one copy.
    if (occasion === 'finish') return 'same';
    tr.delete(pos + 1, pos + node.nodeSize - 1);
    return 'emptied';
  } else {
    tr.insert(pos + 1, content);
  }
  renders.held.set(id, input);
  return 'changed';
}

// Renders the blocks of a state's document for the occasion; the change, if any, and whether a
// block was emptied to be filled after.
function renderAll(
  state: EditorState,
  owner: Document,
  how: { occasion: Occasion; renders: Renders },
) {
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
  // Out of the history, so undo and redo take back the change and this renders again, and no
  // writer is credited with what the document renders.
  return { tr: tr.setMeta(dynamicTemplatesKey, true).setMeta('addToHistory', false), emptied };
}

const occasionOf = (transactions: readonly Transaction[]): Occasion => {
  if (transactions.some(isWritersChange)) return 'own';
  return transactions.some(setsTexts) ? 'texts' : 'other';
};

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
  const renders: Renders = { held: new Map(), told: new Set(), onUnsettled };
  const run = (state: EditorState, occasion: Occasion) => {
    const owner = current?.dom.ownerDocument;
    if (!owner || enabled?.() === false) return null;
    const { tr, emptied } = renderAll(state, owner, { occasion, renders });
    if (emptied) queueMicrotask(() => dispatchRender('finish'));
    return tr;
  };
  const dispatchRender = (occasion: Occasion) => {
    const view = current;
    if (!view || view.isDestroyed) return;
    const tr = run(view.state, occasion);
    if (tr) view.dispatch(tr);
  };
  return new Plugin({
    key: dynamicTemplatesKey,
    view(view) {
      current = view;
      // A document opened with a block that holds anything else, such as one composed from a
      // template whose texts it already stores, is rendered once its view opens.
      queueMicrotask(() => dispatchRender('open'));
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
      return run(state, occasionOf(transactions));
    },
  });
}
