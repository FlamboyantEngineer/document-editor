// The texts the document stores for its variables (DOCE-FORMAT-1.7), brought up to date as edits
// by a writer who edits directly: when a document opens, the texts of the keys it stores none for,
// and whenever the host's variables adapter says a value changed, every key's
// (DOCE-PAGINATION-8.4). Each is one change out of the undo history; the pages lay out the texts
// stored, so a value the host changes reaches the pages, and every collaborator, only by an edit.

import type { Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { useEffect, useRef } from 'react';
import { refreshDocumentValues, type ValueRefresh } from '../../engine/index.js';
import type { VariablesAdapter } from '../../host/index.js';
import type { TemplateFile } from '../../model/index.js';

/**
 * What the refreshes read: the state's plugins, the texts the document stores now, the host's
 * variables and whether it may write.
 */
interface DocumentValuesOptions {
  readonly plugins: readonly Plugin[];
  readonly values: unknown;
  readonly variables?: VariablesAdapter | undefined;
  readonly template: TemplateFile;
  readonly enabled: boolean;
}

// Stores the texts of the variables the view's document shows, now, out of the history.
function refresh(view: EditorView, options: DocumentValuesOptions, kind: ValueRefresh): void {
  if (view.isDestroyed || !view.editable) return;
  const { variables, template } = options;
  const source = { value: (key: string) => variables?.value(key), template };
  refreshDocumentValues(source, kind)(view.state, (tr) =>
    view.dispatch(tr.setMeta('addToHistory', false)),
  );
}

/**
 * Fills the texts a document opened stores none for, and refreshes them all whenever the host says
 * a value changed, while `enabled`. The fill runs again with each new set of the state's plugins,
 * as the element id repair does, since a change made while the pages install theirs is dropped,
 * and whenever the texts the document stores change: in a room a key can be left with no text, as
 * after one writer's undo of a text another set at the same time (DOCE-COLLAB-6.9), and the
 * editors store it again (DOCE-PAGINATION-8.8). The fill only adds the texts of keys the document
 * shows and stores none for, so once they are stored it changes nothing, and it never answers a
 * record that already holds them.
 */
export function useDocumentValues(view: EditorView | null, options: DocumentValuesOptions): void {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const { enabled, variables, plugins, values } = options;
  useEffect(() => {
    if (!view || !enabled) return;
    refresh(view, latest.current, 'missing');
  }, [view, plugins, enabled, values]);
  useEffect(() => {
    if (!view || !enabled) return undefined;
    return variables?.subscribe?.(() => refresh(view, latest.current, 'all'));
  }, [view, enabled, variables]);
}
