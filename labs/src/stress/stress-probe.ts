// What the stress labs show the performance harness (`e2e/performance.spec.ts`) on
// `window.stressLab`: the editor's layout state and counters, when its pages first settled, and a
// remote writer typing into the document, as a collaborator's changes arrive.

import type { EditorView } from 'prosemirror-view';
import { type RefObject, useEffect, useState } from 'react';
import type { DocumentEditorHandle } from '../../../src/components/index.js';
import {
  acceptAllSuggestions,
  linkSuggestionThread,
  listSuggestions,
  suggestTransaction,
} from '../../../src/engine/index.js';
import type { LayoutState, PaginationStats } from '../../../src/pagination/index.js';

/** The stress lab's probe on `window.stressLab`. */
export interface StressProbe {
  whenSettled(): Promise<LayoutState>;
  layoutStats(): PaginationStats | null;
  /** When the pages first settled, in milliseconds from the page's navigation. */
  readonly firstSettledAt: number | null;
  /** Types text into the middle text block, a character a transaction, as a remote writer. */
  typeRemotely(text: string): void;
  /**
   * Types into the middle text block as a remote writer up to the end of its line: until one more
   * character would change the block's height.
   */
  typeRemotelyToLineEnd(): void;
  /** Types text into the middle text block as a suggestion, a character a transaction. */
  suggestRemotely(text: string): void;
  /** Names a thread on every suggestion that has none, as the suggestion threads do. */
  linkSuggestions(): void;
  /** Accepts every suggestion, which leaves the text as it is drawn. */
  acceptSuggestions(): void;
}

// Where the middle text block of a document ends.
function middleEnd(view: EditorView): number | null {
  const ends: number[] = [];
  view.state.doc.descendants((node, pos) => {
    if (node.isTextblock && node.type.name === 'paragraph') ends.push(pos + node.nodeSize - 1);
    return !node.isTextblock;
  });
  return ends[Math.floor(ends.length / 2)] ?? null;
}

/** Types text as a remote writer: each character its own change, outside the undo history. */
export function typeRemotely(view: EditorView, text: string): void {
  for (const character of text) {
    const at = middleEnd(view);
    if (at === null) return;
    view.dispatch(view.state.tr.insertText(character, at).setMeta('addToHistory', false));
  }
}

/** Types text as a remote writer's suggestion: each character its own change. */
export function suggestRemotely(view: EditorView, text: string): void {
  for (const character of text) {
    const at = middleEnd(view);
    if (at === null) return;
    const { state } = view;
    const tr = suggestTransaction(state.tr.insertText(character, at), state, { author: 'remote' });
    if (tr) view.dispatch(tr.setMeta('addToHistory', false));
  }
}

// Names a thread on each suggestion without one, then accepts every suggestion.
const SUGGESTION_STEPS = {
  link: (view: EditorView) => {
    for (const suggestion of listSuggestions(view.state.doc)) {
      if (suggestion.thread) continue;
      linkSuggestionThread(suggestion.id, `t-${suggestion.id}`)(view.state, view.dispatch);
    }
  },
  accept: (view: EditorView) => acceptAllSuggestions(view.state, view.dispatch),
};

// The height the middle text block is drawn at, or null when it is not drawn.
function middleHeight(view: EditorView): number | null {
  const at = middleEnd(view);
  if (at === null) return null;
  const element = view.nodeDOM(view.state.doc.resolve(at).before());
  return element instanceof HTMLElement ? element.getBoundingClientRect().height : null;
}

/** Types as a remote writer until one more character would change the middle block's height. */
export function typeRemotelyToLineEnd(view: EditorView): void {
  const height = middleHeight(view);
  for (let count = 0; height !== null && count < 1000; count += 1) {
    typeRemotely(view, 'x');
    if (middleHeight(view) === height) continue;
    const at = middleEnd(view);
    if (at !== null) {
      view.dispatch(view.state.tr.delete(at - 1, at).setMeta('addToHistory', false));
    }
    return;
  }
}

/** Puts the probe on `window.stressLab` while the lab shows. */
export function useStressProbe(
  handle: RefObject<DocumentEditorHandle | null>,
  firstSettledAt: number | null,
) {
  useEffect(() => {
    const probe: StressProbe = {
      whenSettled: () => handle.current?.whenSettled() ?? Promise.resolve('pending'),
      layoutStats: () => handle.current?.layoutStats() ?? null,
      firstSettledAt,
      typeRemotely: (text) => {
        const view = handle.current?.view();
        if (view) typeRemotely(view, text);
      },
      typeRemotelyToLineEnd: () => {
        const view = handle.current?.view();
        if (view) typeRemotelyToLineEnd(view);
      },
      suggestRemotely: (text) => {
        const view = handle.current?.view();
        if (view) suggestRemotely(view, text);
      },
      linkSuggestions: () => {
        const view = handle.current?.view();
        if (view) SUGGESTION_STEPS.link(view);
      },
      acceptSuggestions: () => {
        const view = handle.current?.view();
        if (view) SUGGESTION_STEPS.accept(view);
      },
    };
    Object.assign(window, { stressLab: probe });
  }, [handle, firstSettledAt]);
}

/** A remote writer typing a letter every quarter second into the middle of the document, while on. */
export function useRemoteTypist(handle: RefObject<DocumentEditorHandle | null>) {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    if (!typing) return undefined;
    let count = 0;
    const timer = window.setInterval(() => {
      const view = handle.current?.view();
      count += 1;
      if (view) typeRemotely(view, count % 6 === 0 ? ' ' : 'x');
    }, 250);
    return () => window.clearInterval(timer);
  }, [handle, typing]);
  return { typing, setTyping };
}
