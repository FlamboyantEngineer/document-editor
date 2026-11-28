// What a host reaches a mounted editor by: the find bar, the editor's handle and the side panels
// the handle reveals panes in, and the scope every part inside the editor shares.

import type { EditorView } from 'prosemirror-view';
import { type RefObject, useLayoutEffect, useRef } from 'react';
import type { TemplateFile } from '../../model/index.js';
import { useEditorPanes } from '../document-panels/document-panels.js';
import type { DocumentEditorProps } from './document-editor.js';
import { useFindBar } from './document-find-bar.js';
import { type CommentRefs, useEditorHandle } from './editor-handle.js';
import type { SnapshotDrawing } from './editor-snapshots.js';
import type { LayoutProgress } from './layout-progress.js';
import { useDocumentExports } from './use-document-exports.js';
import type { TransactionFeed } from './use-editor-engine.js';

/** What the editor's find bar, handle and scope are built from. */
interface HostReachOptions {
  readonly root: RefObject<HTMLDivElement | null>;
  /** The comment actions the handle runs. */
  readonly refs: CommentRefs;
  readonly progress: LayoutProgress;
  readonly transactions: TransactionFeed;
  /**
   * The template the pages are drawn in (`useShownFonts`), which a snapshot of them prints with, so
   * the print draws every font as the pages do (DOCE-PAGINATION-12.5).
   */
  readonly drawn: TemplateFile;
}

/**
 * The editor's find bar, its exports and, for `EditorScope`, its comments, transactions and side
 * panels.
 */
export function useHostReach(
  props: DocumentEditorProps,
  view: EditorView | null,
  { root, refs, progress, transactions, drawn }: HostReachOptions,
) {
  const panes = useEditorPanes(props.comments);
  const find = useFindBar(root, view, { find: props.find, panes });
  const drawing = useRef<SnapshotDrawing | null>(null);
  useLayoutEffect(() => {
    drawing.current = { view, template: drawn };
    return () => {
      drawing.current = null;
    };
  }, [view, drawn]);
  useEditorHandle(props.handleRef, view, {
    ...refs,
    template: drawn,
    drawing,
    layout: progress,
    openFind: find.open,
    panes,
    references: props.referenceSource,
  });
  const exports = useDocumentExports(props, view, { progress, drawing });
  return { find, scope: { comments: props.comments, transactions, panes }, exports };
}
