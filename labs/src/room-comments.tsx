// A reader's comments in a shared room: a comment store over the room's `comments` type
// (`createRoomCommentStore`, DOCE-COMMENTS-2.20) for the editor's margin, a control that starts a
// thread an assistant wrote (DOCE-COMMENTS-2.27), and the threads the room holds as a host would
// store them (`readRoomComments`, DOCE-COLLAB-6.8), deleted ones kept as records
// (DOCE-COMMENTS-2.32).

import type * as Y from '@y/y';
import { type ReactNode, useMemo, useState } from 'react';
import { createRoomCommentStore, readRoomComments } from '../../src/collab/index.js';
import type { DocumentCommentsOptions } from '../../src/components/index.js';
import type { CommentThread, IdentityAdapter } from '../../src/host/index.js';

interface RoomCommentsProps {
  doc: Y.Doc;
  identity: IdentityAdapter;
  documentId: string;
  canComment: boolean;
  /** Whether the reader moderates: the store and the cards let them change anyone's comments. */
  moderates: boolean;
  children: (comments: DocumentCommentsOptions) => ReactNode;
}

const MODERATOR = () => ({ moderate: true });

// A thread's line in the export: its id, state, who started it and its comments, deleted ones too.
function exportLine(thread: CommentThread): string {
  const deleted = thread.entries.filter((entry) => entry.deletedBy).length;
  const agent = thread.agent ? `, by ${thread.agent}` : '';
  const replies = `${String(thread.entries.length)} comments${deleted ? `, ${String(deleted)} deleted` : ''}`;
  const by = thread.deletedBy ? `, deleted by ${thread.deletedBy}` : '';
  return `${thread.id}: ${thread.state}${by}${agent} (${replies})`;
}

function ThreadExport({ doc, name }: { doc: Y.Doc; name: string }) {
  const [threads, setThreads] = useState<CommentThread[] | null>(null);
  return (
    <>
      <button type="button" onClick={() => setThreads(readRoomComments(doc))}>
        Export the room’s threads
      </button>
      {threads && (
        <ul aria-label={`${name}'s exported threads`}>
          {threads.map((thread) => (
            <li key={thread.id}>{exportLine(thread)}</li>
          ))}
        </ul>
      )}
    </>
  );
}

const newId = () => Math.random().toString(16).slice(2, 10).padEnd(8, '0');

/** The reader's comments over the room's threads, for the editor's `comments` prop. */
export function RoomComments(props: RoomCommentsProps) {
  const { doc, identity, moderates } = props;
  const store = useMemo(
    () => createRoomCommentStore({ doc, identity, moderates }),
    [doc, identity, moderates],
  );
  const name = identity.currentPerson().name;
  const startAssistantThread = () =>
    void store.create(props.documentId, {
      id: newId(),
      quote: '',
      text: 'The assistant read the scope: two requirements name no time.',
      scope: 'document',
      agent: 'drafting-assistant',
    });
  return (
    <>
      <p>
        <button type="button" onClick={startAssistantThread}>
          Start a thread as the assistant
        </button>{' '}
        <ThreadExport doc={doc} name={name} />
      </p>
      {props.children({
        store,
        documentId: props.documentId,
        identity,
        canComment: props.canComment,
        threadPermissions: moderates ? MODERATOR : undefined,
        presentation: 'cards',
      })}
    </>
  );
}
