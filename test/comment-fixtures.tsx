// The comment tests' document, host and editor: a paragraph with an open and a resolved thread and
// a suggestion, kept by an in-memory host whose reader is Ada.

import { EditorState, TextSelection } from 'prosemirror-state';
import { type Ref, useEffect, useState } from 'react';
import {
  DocumentCommentsPanel,
  type DocumentCommentsPanelProps,
} from '../src/components/document-comments/comments-panel.js';
import type { DocumentCommentsOptions } from '../src/components/document-comments/document-comments.js';
import { DocumentEditor } from '../src/components/document-editor/document-editor.js';
import type { DocumentEditorHandle } from '../src/components/document-editor/editor-handle.js';
import { createDocumentEditing } from '../src/engine/index.js';
import { type CommentThread, createMemoryHost, type EditorHost } from '../src/host/index.js';
import { readDocumentFile, type StoredNode, type TemplateFile } from '../src/model/index.js';
import { documentSchema } from './document-markup.js';

const TEMPLATE: TemplateFile = { formatVersion: 1, id: 'article' };

export const text = (value: string, marks?: StoredNode['marks']): StoredNode => ({
  type: 'text',
  text: value,
  ...(marks ? { marks } : {}),
});

export const thread = (
  id: string,
  state: CommentThread['state'],
  comment: string,
): CommentThread => ({
  id,
  state,
  quote: id === 'open' ? 'blue' : 'delta',
  suggestion: null,
  entries: [{ id: `${id}-1`, author: 'ada', text: comment, createdAt: '2026-01-02T03:04:05Z' }],
});

/** The paragraph the tests start from: an open and a resolved thread, then Ada's suggestion. */
export const PARAGRAPH: readonly StoredNode[] = [
  text('Alpha '),
  text('blue', [{ type: 'comment', attrs: { thread: 'open', state: 'open' } }]),
  text(' gamma '),
  text('delta', [{ type: 'comment', attrs: { thread: 'done', state: 'resolved' } }]),
  text(' '),
  text('epsilon', [{ type: 'insertion', attrs: { id: 's1', author: 'ada' } }]),
];

export function initial(select?: string, content: readonly StoredNode[] = PARAGRAPH) {
  const doc = readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [
            {
              type: 'paragraph',
              content: [...content],
            },
          ],
        },
      ],
    },
    documentSchema,
  ).doc;
  let selection: TextSelection | undefined;
  doc.descendants((node, pos) => {
    const at = select && node.isText ? (node.text?.indexOf(select) ?? -1) : -1;
    if (select && at >= 0)
      selection = TextSelection.create(doc, pos + at, pos + at + select.length);
    return !selection;
  });
  return EditorState.create({ doc, selection, plugins: createDocumentEditing(documentSchema) });
}

export const host = () =>
  createMemoryHost({
    person: { id: 'ada', name: 'Ada Lovelace' },
    comments: {
      threads: {
        doc: [thread('open', 'open', 'Is blue right?'), thread('done', 'resolved', 'Old')],
      },
    },
  });

// The state the harness last committed, which the tests read the document from.
export const seen: { state: EditorState | null } = { state: null };

export function Harness(props: {
  host: EditorHost;
  select?: string;
  canComment?: boolean;
  editable?: boolean;
  decide?: DocumentCommentsOptions['decide'];
  /** The margin's other options. */
  options?: Partial<DocumentCommentsOptions>;
  /** Shows the comments panel inside the editor too, with these props. */
  panel?: boolean | Partial<DocumentCommentsPanelProps>;
  /** The paragraph's content, in place of `PARAGRAPH`. */
  content?: readonly StoredNode[];
  /** Receives the editor's handle. */
  handleRef?: Ref<DocumentEditorHandle>;
}) {
  const [state, setState] = useState(() => initial(props.select, props.content));
  useEffect(() => {
    seen.state = state;
  });
  const { comments, identity } = props.host;
  return (
    <DocumentEditor
      state={state}
      onStateChange={setState}
      template={TEMPLATE}
      layout="web"
      editable={props.editable}
      aria-label="Report"
      handleRef={props.handleRef}
      comments={
        comments
          ? {
              store: comments,
              documentId: 'doc',
              identity,
              canComment: props.canComment,
              decide: props.decide,
              ...props.options,
            }
          : undefined
      }
    >
      {props.panel && comments ? (
        <DocumentCommentsPanel
          store={comments}
          documentId="doc"
          identity={identity}
          {...(typeof props.panel === 'object' ? props.panel : {})}
        />
      ) : null}
    </DocumentEditor>
  );
}
