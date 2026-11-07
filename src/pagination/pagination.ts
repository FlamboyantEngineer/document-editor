// Keeps an editor's pages laid out. A hidden view renders the whole document, each section on one
// page with whole blocks, and follows the editor's document by the smallest replacement, so only
// changed blocks render and measure again. After a change the pages are laid out from it, and the
// editor is stepped onto them outside the undo history.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState, Plugin, PluginKey, TextSelection, type Transaction } from 'prosemirror-state';
import { type EditorProps, EditorView } from 'prosemirror-view';
import {
  FRAGMENT_RULES,
  type FragmentRules,
  joinDocumentPages,
  projectDocument,
  repaginate,
} from '../model/index.js';
import { type DocumentLayoutOptions, layoutDocument } from './layout-document.js';
import { createMeasureCache } from './measure-blocks.js';

/** How an editor's pages are kept laid out. */
export interface PaginationOptions extends Omit<DocumentLayoutOptions, 'scale' | 'cache'> {
  /**
   * Where the hidden view that measures the document mounts. Blocks must lay out there as in a
   * page's content: at its width, with its styles; the footnote area likewise.
   */
  measureIn: HTMLElement;
  /** The node views the editor renders with, so blocks measure as they show. */
  nodeViews?: EditorProps['nodeViews'];
  /** Plugins that change what the editor renders, such as page variables, for the same reason. */
  plugins?: readonly Plugin[] | undefined;
  fragmentRules?: FragmentRules | undefined;
  /** How much the editor is scaled on screen, such as by a zoom. */
  scale?: (() => number) | undefined;
  /** Runs a layout soon and returns how to cancel it; by default on the next animation frame. */
  schedule?: ((run: () => void) => () => void) | undefined;
}

/** An editor's pagination: its plugin, and a way to lay the pages out again. */
export interface Pagination {
  readonly plugin: Plugin<boolean>;
  /**
   * Lays the pages out again. `remeasure` forgets every measurement and starts the measuring view's
   * plugins over, as after a width change or a change to a value a plugin shows.
   */
  refresh(options?: { remeasure?: boolean }): void;
}

/** Marks the transactions that move an editor onto new pages; its state says a layout is due. */
export const paginationKey = new PluginKey<boolean>('pagination');

/** Whether a transaction moved the editor onto new pages, rather than changing its content. */
export function isPaginationTransaction(tr: Transaction): boolean {
  return tr.getMeta(paginationKey) === true;
}

function frame(run: () => void): () => void {
  const handle = requestAnimationFrame(run);
  return () => cancelAnimationFrame(handle);
}

// Moves the measuring view onto the whole document by the smallest replacement, so the blocks
// around the change keep their nodes, their rendering and their cached measurements.
function follow(measuring: EditorView, whole: ProseMirrorNode): void {
  const { state } = measuring;
  const current = state.doc;
  const start = current.content.findDiffStart(whole.content);
  if (start === null) return;
  const end = current.content.findDiffEnd(whole.content);
  let endA = end?.a ?? current.content.size;
  let endB = end?.b ?? whole.content.size;
  const overlap = start - Math.min(endA, endB);
  if (overlap > 0) {
    endA += overlap;
    endB += overlap;
  }
  const tr = state.tr.replace(start, endA, whole.slice(start, endB));
  const next = tr.doc.eq(whole)
    ? state.apply(tr)
    : EditorState.create({ doc: whole, plugins: state.plugins });
  measuring.updateState(next);
}

interface FootnoteAnchor {
  readonly id: string;
  readonly anchor: number;
  readonly head: number;
}

// The footnote entry a selection lies in, with its ends from the entry's start.
function footnoteAnchor({ selection }: EditorState): FootnoteAnchor | null {
  const { $from, $to } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name !== 'footnote_entry') continue;
    const id = node.attrs.footnoteId as unknown;
    if (typeof id !== 'string' || !id || $to.node(depth) !== node) return null;
    const start = $from.start(depth);
    return { id, anchor: selection.anchor - start, head: selection.head - start };
  }
  return null;
}

function findFootnoteEntry(doc: ProseMirrorNode, id: string) {
  const found: { node: ProseMirrorNode; pos: number }[] = [];
  doc.descendants((node, pos) => {
    if (found.length) return false;
    if (node.type.name === 'footnote_entry' && node.attrs.footnoteId === id)
      found.push({ node, pos });
    return !found.length;
  });
  return found[0] ?? null;
}

// Puts a selection back in its footnote entry when the entry moved to another page.
function restoreFootnoteSelection(tr: Transaction, anchor: FootnoteAnchor | null): void {
  if (!anchor || footnoteAnchor({ selection: tr.selection } as EditorState)?.id === anchor.id) {
    return;
  }
  const entry = findFootnoteEntry(tr.doc, anchor.id);
  if (!entry) return;
  const size = entry.node.content.size;
  const at = (offset: number) => entry.pos + 1 + Math.min(Math.max(offset, 0), size);
  tr.setSelection(TextSelection.create(tr.doc, at(anchor.anchor), at(anchor.head)));
}

interface Runner {
  editor: EditorView | null;
  measuring: EditorView | null;
  cancel: (() => void) | null;
  /** Whether the measuring view's plugins start over, as after a value they show changed. */
  restart: boolean;
}

/** Keeps an editor's pages laid out from a hidden view that measures its whole document. */
export function createPagination(options: PaginationOptions): Pagination {
  const fragmentRules = options.fragmentRules ?? FRAGMENT_RULES;
  const schedule = options.schedule ?? frame;
  const cache = createMeasureCache();
  const runner: Runner = { editor: null, measuring: null, cancel: null, restart: false };

  const wholeOf = (doc: ProseMirrorNode): ProseMirrorNode =>
    joinDocumentPages(doc, fragmentRules).doc;

  const layOut = (): void => {
    runner.cancel = null;
    const { editor, measuring } = runner;
    if (!editor || !measuring) return;
    if (editor.composing) return request();
    const { state } = editor;
    const whole = wholeOf(state.doc);
    if (runner.restart) {
      runner.restart = false;
      measuring.updateState(EditorState.create({ doc: whole, plugins: measuring.state.plugins }));
    } else follow(measuring, whole);
    const sections = layoutDocument(measuring, { ...options, scale: options.scale?.(), cache });
    const target = projectDocument(measuring.state.doc, sections, options);
    const tr = state.tr;
    repaginate(tr, target, fragmentRules);
    restoreFootnoteSelection(tr, footnoteAnchor(state));
    editor.dispatch(tr.setMeta(paginationKey, true).setMeta('addToHistory', false));
  };

  const request = (): void => {
    runner.cancel ??= schedule(layOut);
  };

  const plugin = new Plugin<boolean>({
    key: paginationKey,
    state: {
      init: () => true,
      apply: (tr, due) => (isPaginationTransaction(tr) ? false : due || tr.docChanged),
    },
    view(editor) {
      runner.editor = editor;
      runner.measuring = new EditorView(options.measureIn, {
        state: EditorState.create({
          doc: wholeOf(editor.state.doc),
          plugins: [...(options.plugins ?? [])],
        }),
        editable: () => false,
        nodeViews: options.nodeViews ?? {},
      });
      request();
      return {
        update(view) {
          runner.editor = view;
          if (paginationKey.getState(view.state)) request();
        },
        destroy() {
          runner.cancel?.();
          runner.measuring?.destroy();
          Object.assign(runner, { editor: null, measuring: null, cancel: null, restart: false });
        },
      };
    },
  });

  return {
    plugin,
    refresh({ remeasure = false } = {}) {
      if (remeasure) {
        cache.clear();
        runner.restart = true;
      }
      request();
    },
  };
}
