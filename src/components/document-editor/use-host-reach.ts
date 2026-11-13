// What a host reaches a mounted editor by: the find bar, the editor's handle and the side panels
// the handle reveals panes in, and the scope every part inside the editor shares.

import type { EditorView } from 'prosemirror-view';
import type { RefObject } from 'react';
import { useEditorPanes } from '../document-panels/document-panels.js';
import type { DocumentEditorProps } from './document-editor.js';
import { useFindBar } from './document-find-bar.js';
import { type CommentRefs, useEditorHandle } from './editor-handle.js';
import { useDocumentExports } from './use-document-exports.js';
import type { LayoutProgress } from './use-document-layout.js';
import type { TransactionFeed } from './use-editor-engine.js';

/** What the editor's find bar, handle and scope are built from. */
export interface HostReachOptions {
  readonly root: RefObject<HTMLDivElement | null>;
  /** The comment actions the handle runs. */
  readonly refs: CommentRefs;
  readonly progress: LayoutProgress;
  readonly transactions: TransactionFeed;
}

/**
 * The editor's find bar, its exports and, for `EditorScope`, its comments, transactions and side
 * panels.
 */
export function useHostReach(
  props: DocumentEditorProps,
  view: EditorView | null,
  { root, refs, progress, transactions }: HostReachOptions,
) {
  const find = useFindBar(root, view, Boolean(props.find));
  const panes = useEditorPanes(props.comments);
  useEditorHandle(props.handleRef, view, {
    ...refs,
    template: props.template,
    layout: progress,
    openFind: find.open,
    panes,
    references: props.referenceSource,
  });
  const exports = useDocumentExports(props, view, progress);
  return { find, scope: { comments: props.comments, transactions, panes }, exports };
}
