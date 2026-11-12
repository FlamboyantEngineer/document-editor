// What the stress labs show the performance harness (`e2e/performance.spec.ts`) on
// `window.stressLab`: the editor's layout state and counters, when its pages first settled, and a
// remote writer typing into the document, as a collaborator's changes arrive.

import type { EditorView } from 'prosemirror-view';
import { type RefObject, useEffect, useState } from 'react';
import type { DocumentEditorHandle } from '../../../src/components/index.js';
import type { LayoutState, PaginationStats } from '../../../src/pagination/index.js';

/** The stress lab's probe on `window.stressLab`. */
export interface StressProbe {
  whenSettled(): Promise<LayoutState>;
  layoutStats(): PaginationStats | null;
  /** When the pages first settled, in milliseconds from the page's navigation. */
  readonly firstSettledAt: number | null;
  /** Types text into the middle text block, a character a transaction, as a remote writer. */
  typeRemotely(text: string): void;
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
