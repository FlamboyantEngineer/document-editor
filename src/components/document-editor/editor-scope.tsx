// What every part inside the editor shares: the editor context and, when the editor shows
// comments, one state of the document's threads, which records the decisions the editor's
// transactions make.

import type { ReactNode } from 'react';
import {
  type DocumentCommentsOptions,
  EditorCommentThreads,
} from '../document-comments/document-comments.js';
import { DocumentEditorContext, type EditorContext } from './editor-context.js';
import type { TransactionFeed } from './use-editor-engine.js';

/** The editor context and the editor's comment threads for the parts inside the editor. */
export function EditorScope({
  context,
  comments,
  transactions,
  children,
}: {
  readonly context: EditorContext;
  readonly comments: DocumentCommentsOptions | undefined;
  readonly transactions: TransactionFeed;
  readonly children: ReactNode;
}) {
  return (
    <DocumentEditorContext value={context}>
      <EditorCommentThreads comments={comments} transactions={transactions}>
        {children}
      </EditorCommentThreads>
    </DocumentEditorContext>
  );
}
