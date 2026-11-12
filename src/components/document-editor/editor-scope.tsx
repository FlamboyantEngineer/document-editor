// What every part inside the editor shares: the editor context, its side panels and, when the
// editor shows comments, one state of the document's threads.

import type { ReactNode } from 'react';
import {
  type DocumentCommentsOptions,
  EditorCommentThreads,
} from '../document-comments/document-comments.js';
import { type EditorPanes, EditorPanesContext } from '../document-panels/document-panels.js';
import { DocumentEditorContext, type EditorContext } from './editor-context.js';

/** The editor context, side panels and comment threads for the parts inside the editor. */
export function EditorScope({
  context,
  comments,
  panes,
  children,
}: {
  readonly context: EditorContext;
  readonly comments: DocumentCommentsOptions | undefined;
  readonly panes: EditorPanes;
  readonly children: ReactNode;
}) {
  return (
    <DocumentEditorContext value={context}>
      <EditorPanesContext value={panes}>
        <EditorCommentThreads comments={comments}>{children}</EditorCommentThreads>
      </EditorPanesContext>
    </DocumentEditorContext>
  );
}
