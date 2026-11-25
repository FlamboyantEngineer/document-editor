// More of the automation lab's stored-file tools, run on the stored document as a host's server
// would, without an editor: the ids checked and repaired (`checkStoredIds`, `assignStoredIds`) and
// the document copied (`copyDocumentFile`); a thread's anchor resolved, reopened, deleted or
// removed (`updateStoredThreads`); the embeds, the writers, the authored content and the outline
// read (`storedEmbeds`, `storedContributors`, `authoredContent`, `storedOutline`); the scripts whose
// output is stale found (`findStaleStoredScripts`); and one suggestion accepted with the writer of
// its thread credited when it records none (`threadAuthor`).

import type { Schema } from 'prosemirror-model';
import { useState } from 'react';
import {
  authoredContent,
  decideStoredSuggestions,
  findStaleStoredScripts,
  storedContributors,
  storedEmbeds,
  storedOutline,
  type StoredThreadChange,
  threadAnchors,
  updateStoredThreads,
} from '../../src/document/index.js';
import { createElementId, listSuggestions } from '../../src/engine/index.js';
import type { ScriptRunnerAdapter, StoredDocument } from '../../src/host/index.js';
import {
  assignStoredIds,
  checkStoredIds,
  copyDocumentFile,
  type DocumentFile,
  readDocumentFile,
  type TemplateFile,
} from '../../src/model/index.js';

/** What the stored-file tools work on and how they report. */
export interface StoredToolsProps {
  readonly stored: StoredDocument | null;
  /** The content of the save before, for the writers of what changed since. */
  readonly previous: DocumentFile | null;
  readonly schema: Schema;
  readonly template: TemplateFile;
  readonly runner: ScriptRunnerAdapter;
  /** Who opened each thread, for a suggestion that records no writer. */
  readonly threadWriters: Readonly<Record<string, string>>;
  /** Saves a change of the stored document, as the host's server would. */
  save(change: (file: DocumentFile) => DocumentFile | null, what: string): Promise<void>;
  /** Shows what a tool read. */
  show(output: unknown): void;
}

const THREAD_CHANGES: readonly StoredThreadChange[] = ['resolved', 'open', 'deleted', 'removed'];

// A copy of the document whose second top-level block of the last section repeats the first's id,
// as a careless writer's paste would leave it.
function repeatAnId(file: DocumentFile): DocumentFile | null {
  const copy = structuredClone(file);
  const content = copy.sections.at(-1)?.content ?? [];
  const [first, second] = content;
  if (!first?.attrs?.id || !second) return null;
  second.attrs = { ...second.attrs, id: first.attrs.id };
  return copy;
}

/** The stored-file tools: ids, threads, more readers, stale scripts and a credited decision. */
export function StoredTools(props: StoredToolsProps) {
  const { stored, previous, schema, template, runner, threadWriters, save, show } = props;
  const [change, setChange] = useState<StoredThreadChange>('resolved');
  const [sinceBefore, setSinceBefore] = useState(false);
  const [headingId, setHeadingId] = useState('');
  const [leaveScripts, setLeaveScripts] = useState(false);
  const [credit, setCredit] = useState(true);
  const read = (reader: (file: DocumentFile) => unknown) => {
    if (stored) show(reader(stored.content));
  };
  const findStale = async () => {
    if (!stored) return;
    show({ stale: await findStaleStoredScripts(stored.content, { schema, runner }) });
  };
  const changeFirstThread = () =>
    save((file) => {
      const [first] = threadAnchors(file);
      if (!first) return null;
      const changed = updateStoredThreads(file, { schema, changes: { [first.thread]: change } });
      show({ thread: first.thread, change, changed: changed.changed });
      return changed.changed.length ? changed.file : null;
    }, `Thread ${change}`);
  const acceptFirst = () =>
    save((file) => {
      const first = listSuggestions(readDocumentFile(file, schema, { unknown: 'keep' }).doc)[0];
      if (!first) return null;
      const decided = decideStoredSuggestions(file, {
        schema,
        decision: 'accept',
        ids: [first.id],
        threadAuthor: credit ? (thread) => threadWriters[thread] : undefined,
      });
      show({ decided: decided.decided, writers: storedContributors(decided.file) });
      return decided.file;
    }, 'Accepted the first suggestion');
  return (
    <>
      <fieldset>
        <legend>Stored ids and threads</legend>
        <button type="button" onClick={() => void save(repeatAnId, 'A pasted copy')}>
          Paste a copy with a repeated id
        </button>{' '}
        <button type="button" onClick={() => read(checkStoredIds)}>
          Check the stored ids
        </button>{' '}
        <button
          type="button"
          onClick={() =>
            void save(
              (file) =>
                checkStoredIds(file).length
                  ? assignStoredIds(file, { newId: createElementId, author: 'ada' })
                  : null,
              'Repaired the ids',
            )
          }
        >
          Repair the stored ids
        </button>{' '}
        <button
          type="button"
          onClick={() =>
            read((file) => {
              const copy = copyDocumentFile(file, { newId: createElementId, author: 'ada' });
              const ids = (each: DocumentFile) =>
                each.sections.flatMap((section) => section.content.map((node) => node.attrs?.id));
              const before = new Set(ids(file));
              return {
                copied: ids(copy).length,
                keptIds: ids(copy).filter((id) => before.has(id)).length,
                writers: storedContributors(copy),
                threads: threadAnchors(copy).length,
              };
            })
          }
        >
          Copy the document
        </button>
        <div>
          <label>
            Thread change{' '}
            <select
              value={change}
              onChange={(event) => setChange(event.currentTarget.value as StoredThreadChange)}
            >
              {THREAD_CHANGES.map((each) => (
                <option key={each}>{each}</option>
              ))}
            </select>
          </label>{' '}
          <button type="button" onClick={() => void changeFirstThread()}>
            Change the first thread
          </button>{' '}
          <label>
            <input
              type="checkbox"
              checked={credit}
              onChange={(event) => setCredit(event.currentTarget.checked)}
            />{' '}
            Credit the thread&apos;s writer
          </label>{' '}
          <button type="button" onClick={() => void acceptFirst()}>
            Accept the first suggestion, credited
          </button>
        </div>
      </fieldset>
      <fieldset>
        <legend>More stored-file readers</legend>
        <button type="button" onClick={() => read(storedEmbeds)}>
          List the embeds
        </button>{' '}
        <label>
          <input
            type="checkbox"
            checked={sinceBefore}
            onChange={(event) => setSinceBefore(event.currentTarget.checked)}
          />{' '}
          Only since the save before
        </label>{' '}
        <button
          type="button"
          onClick={() =>
            read((file) =>
              storedContributors(file, {
                since: sinceBefore ? (previous ?? undefined) : undefined,
              }),
            )
          }
        >
          List the writers
        </button>{' '}
        <button
          type="button"
          onClick={() => read((file) => storedOutline(file, { schema, template }))}
        >
          Read the outline
        </button>
        <div>
          <label>
            Heading id{' '}
            <input
              value={headingId}
              onChange={(event) => setHeadingId(event.currentTarget.value)}
            />
          </label>{' '}
          <label>
            <input
              type="checkbox"
              checked={leaveScripts}
              onChange={(event) => setLeaveScripts(event.currentTarget.checked)}
            />{' '}
            Leave out script output
          </label>{' '}
          <button
            type="button"
            onClick={() =>
              read((file) => {
                const read = authoredContent(file, {
                  headings: headingId.trim() ? [headingId.trim()] : undefined,
                  leaveOutput: () => leaveScripts,
                });
                return { content: JSON.parse(read.content) as unknown, missing: read.missing };
              })
            }
          >
            Read the authored content
          </button>{' '}
          <button type="button" onClick={() => void findStale()}>
            Find stale scripts
          </button>
        </div>
      </fieldset>
    </>
  );
}
