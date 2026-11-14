// What every part inside the editor shares: the editor context, its side panels and, when the
// editor shows comments, one state of the document's threads, which records the decisions the
// editor's transactions make.

import type { ReactNode } from 'react';
import {
  type DocumentCommentsOptions,
  EditorCommentThreads,
} from '../document-comments/document-comments.js';
import { type EditorPanes, EditorPanesContext } from '../document-panels/document-panels.js';
import { DocumentEditorContext, type EditorContext } from './editor-context.js';
import { DocumentEditorStoreContext, useEditorStore } from './editor-store.js';
import type { TransactionFeed } from './use-editor-engine.js';

/** The editor context, side panels and comment threads for the parts inside the editor. */
export function EditorScope({
  context,
  comments,
  panes,
  transactions,
  children,
}: {
  readonly context: EditorContext;
  readonly comments: DocumentCommentsOptions | undefined;
  readonly panes: EditorPanes;
  readonly transactions: TransactionFeed;
  readonly children: ReactNode;
}) {
  const store = useEditorStore(context);
  return (
    <DocumentEditorContext value={context}>
      <DocumentEditorStoreContext value={store}>
        <EditorPanesContext value={panes}>
          <EditorCommentThreads comments={comments} transactions={transactions}>
            {children}
          </EditorCommentThreads>
        </EditorPanesContext>
      </DocumentEditorStoreContext>
    </DocumentEditorContext>
  );
}
