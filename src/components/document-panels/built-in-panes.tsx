// The side panel's built-in panes as host panes: the outline, search and replace, the properties,
// the editor's comments with their open count, and the contributors.

import {
  ChatBubbleCheckGlyph,
  InfoGlyph,
  ListTaskGlyph,
  SearchGlyph,
  UsersGlyph,
} from '@flamboyantengineer/ui-components/core';
import type { ContextType } from 'react';
import {
  type DocumentCommentsOptions,
  DocumentCommentsPanel,
  type SharedCommentThreadsContext,
} from '../document-comments/document-comments.js';
import type { EditorContext } from '../document-editor/document-editor.js';
import { DocumentContributors } from './document-contributors.js';
import { DocumentOutline } from './document-outline.js';
import { DocumentProperties } from './document-properties.js';
import { DocumentSearchPane } from './document-search-pane.js';
import type { BuiltInPane, DocumentPane, DocumentSidePanelProps } from './document-side-panel.js';
import type { DocumentPanelsLabels } from './panel-labels.js';

/** What the built-in panes draw on. */
export interface BuiltInSources {
  readonly props: DocumentSidePanelProps;
  readonly labels: DocumentPanelsLabels;
  /** The editor's comments, without which there is no comments pane. */
  readonly comments: DocumentCommentsOptions | undefined;
  /** The thread state the editor shares, which the comments pane counts. */
  readonly threads: ContextType<typeof SharedCommentThreadsContext>;
}

// The open threads of the editor's comments, null while there are none or they are not known.
function openThreads({ comments, threads }: BuiltInSources): number | null {
  if (!comments || threads?.store !== comments.store) return null;
  let open = 0;
  for (const thread of threads.threads.threads.values()) if (thread.state === 'open') open += 1;
  return open > 0 ? open : null;
}

// The comments panel of the editor's comments. The margin's `filter` is where the pane's starts:
// given as the pane's own, it would hold the pane's choices to it.
function CommentsPane({
  comments,
  context,
}: {
  comments: DocumentCommentsOptions;
  context: EditorContext;
}) {
  const { filter, ...shared } = comments;
  return <DocumentCommentsPanel {...shared} defaultFilter={filter} context={context} />;
}

/** A built-in pane as a host pane; null for the comments pane of an editor without comments. */
export function builtInPane(id: BuiltInPane, sources: BuiltInSources): DocumentPane | null {
  const { props, labels, comments } = sources;
  const { template } = props;
  switch (id) {
    case 'outline':
      return {
        id,
        label: labels.outline,
        icon: ListTaskGlyph,
        render: (context) => (
          <DocumentOutline context={context} template={template} aria-label={labels.outline} />
        ),
      };
    case 'search':
      return {
        id,
        label: labels.search,
        icon: SearchGlyph,
        render: (context) => <DocumentSearchPane context={context} template={template} />,
      };
    case 'properties':
      return {
        id,
        label: labels.properties,
        icon: InfoGlyph,
        render: (context) => (
          <DocumentProperties
            context={context}
            template={template}
            labels={labels}
            sections={props.properties?.sections}
            extend={props.properties?.extend}
          />
        ),
      };
    case 'comments':
      return comments
        ? {
            id,
            label: labels.comments,
            icon: ChatBubbleCheckGlyph,
            count: openThreads(sources),
            render: (context) => <CommentsPane comments={comments} context={context} />,
          }
        : null;
    case 'contributors':
      return {
        id,
        label: labels.contributors,
        icon: UsersGlyph,
        render: (context) => (
          <DocumentContributors
            context={context}
            identity={props.identity ?? comments?.identity}
            onAuthorshipChange={props.onAuthorshipChange}
            labels={labels}
          />
        ),
      };
  }
}
