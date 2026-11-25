// The session-in-a-room lab's document and the threads its room starts with: a paragraph with a
// thread on it, a sentence an assistant suggested, a list of two items two writers can each delete
// one of, and threads written into the room with `writeRoomComments` (DOCE-COLLAB-6.8), among them
// one an assistant started, a deleted thread and a deleted reply kept as records.

import * as Y from '@y/y';
import { EditorState } from 'prosemirror-state';
import { writeRoomComments, writeRoomDocument } from '../../src/collab/index.js';
import { applyEdits } from '../../src/engine/index.js';
import type { CommentThread } from '../../src/host/index.js';
import {
  createDocumentSchema,
  type DocumentFile,
  readDocumentFile,
  type StoredNode,
  writeDocumentFile,
} from '../../src/model/index.js';
import { heading, text } from './lab-document.js';

export const ROOM_SCHEMA = createDocumentSchema();

const paragraph = (id: string, content: StoredNode[]): StoredNode => ({
  type: 'paragraph',
  attrs: { id },
  content,
});

const item = (ids: [string, string], words: string): StoredNode => ({
  type: 'listItem',
  attrs: { id: ids[0] },
  content: [paragraph(ids[1], [text(words)])],
});

const WRITTEN: DocumentFile = {
  formatVersion: 1,
  sections: [
    {
      name: null,
      content: [
        { ...heading(1, 'Scope'), attrs: { level: 1, id: 'a0000001' } },
        paragraph('a0000002', [text('The system shall report each fault within one second.')]),
        paragraph('a0000003', [
          text('The '),
          {
            ...text('operator'),
            marks: [{ type: 'comment', attrs: { thread: 'c0ffee01', state: 'open' } }],
          },
          text(' acknowledges each alarm.'),
        ]),
        {
          type: 'bulletList',
          attrs: { id: 'a0000005' },
          content: [
            item(['a0000006', 'a0000007'], 'Log the fault'),
            item(['a0000008', 'a0000009'], 'Raise the alarm'),
          ],
        },
        // Last, so that no block a writer moves passes another writer's suggestion.
        paragraph('a0000004', [text('Faults are logged.')]),
      ],
    },
  ],
};

// The document with an assistant's suggested words in its fourth paragraph, generated text whose
// writer is the assistant's session: accepted, it is credited to whoever accepts it
// (DOCE-SUGGESTIONS-2.7).
function withAssistantSuggestion(file: DocumentFile): DocumentFile {
  const state = EditorState.create({ doc: readDocumentFile(file, ROOM_SCHEMA).doc });
  const result = applyEdits(
    state,
    [{ op: 'insertText', at: { elementId: 'a0000004', from: 17 }, text: ' with their time' }],
    {
      actor: { id: 'drafting-assistant', kind: 'agent', session: 'lab-session' },
      mode: 'suggest',
      newId: () => 'b0000001',
    },
  );
  if (!result.ok) throw new Error(result.error.message);
  return writeDocumentFile(state.apply(result.tr).doc);
}

export const ROOM_DOCUMENT = withAssistantSuggestion(WRITTEN);

const at = (day: number, hour: number) =>
  `2026-01-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z`;

/** The threads the room starts with, as a host's store kept them. */
export const ROOM_THREADS: CommentThread[] = [
  {
    id: 'c0ffee01',
    state: 'open',
    quote: 'operator',
    suggestion: null,
    target: {
      ranges: [{ element: 'a0000003', start: 4, end: 12, text: 'operator' }],
      quote: 'operator',
    },
    author: 'grace',
    createdAt: at(5, 9),
    updatedAt: at(5, 11),
    entries: [
      { id: 'e0000001', author: 'grace', text: 'Which operator?', createdAt: at(5, 9) },
      {
        id: 'e0000002',
        author: 'ada',
        text: 'An old note.',
        createdAt: at(5, 10),
        deletedBy: 'ada',
        deletedAt: at(5, 10),
      },
      { id: 'e0000003', author: 'ada', text: 'The one on shift.', createdAt: at(5, 11) },
    ],
  },
  {
    id: 'c0ffee02',
    state: 'open',
    quote: '',
    suggestion: null,
    scope: 'document',
    author: 'ada',
    agent: 'drafting-assistant',
    createdAt: at(6, 8),
    updatedAt: at(6, 8),
    entries: [
      {
        id: 'e0000004',
        author: 'ada',
        agent: 'drafting-assistant',
        text: 'The scope names no response time for alarms.',
        createdAt: at(6, 8),
      },
    ],
  },
  {
    id: 'c0ffee03',
    state: 'deleted',
    quote: '',
    suggestion: null,
    scope: 'document',
    author: 'grace',
    createdAt: at(4, 8),
    updatedAt: at(4, 9),
    deletedBy: 'grace',
    deletedAt: at(4, 9),
    entries: [
      { id: 'e0000005', author: 'grace', text: 'A thread Grace deleted.', createdAt: at(4, 8) },
    ],
  },
];

/** The room's first state: the document, then its threads (DOCE-COLLAB-6.8). */
export function roomSeedWithThreads(): Uint8Array {
  const doc = new Y.Doc();
  writeRoomDocument(doc, ROOM_DOCUMENT, { schema: ROOM_SCHEMA });
  writeRoomComments(doc, ROOM_THREADS);
  return Y.encodeStateAsUpdate(doc);
}
