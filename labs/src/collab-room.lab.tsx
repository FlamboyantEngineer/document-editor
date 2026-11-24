// Two writers edit one document in a shared room, on a room server in this page, each at their own
// width and zoom: what either types reaches the other, the room's seed comes from `documentToYjs`,
// and each writer's undo undoes only their own changes. Either can go offline and edit on their
// own, then come back and merge, and either can switch between the pages and the web layout. The
// page shows the harness the document each writer's editor holds (`window.collabRoom`). With
// `?document=long`, the document ends with code and a list of contents too long for one page, which
// the pages split while the room holds each whole. With `?textLayout=pretext`, the writers' pages
// are laid out by the layout engine, and the probe opens a writer's stored document afresh in a
// third editor below them, so a test compares each writer's pages with a fresh layout.

import { EditorState, TextSelection } from 'prosemirror-state';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { updateRoomDocument } from '../../src/collab/convert.js';
import { readContent } from '../../src/collab/delta.js';
import { wholeValuesOf } from '../../src/collab/guard-shape.js';
import {
  DocumentEditor,
  type DocumentEditorHandle,
  DocumentSessionBoundary,
  useDocumentSession,
  useSessionValue,
} from '../../src/components/index.js';
import type { PagesLayout } from '../../src/document/index.js';
import { createDocumentEditing } from '../../src/engine/index.js';
import { createMemoryHost, type EditorHost } from '../../src/host/index.js';
import {
  type DocumentFile,
  readDocumentFile,
  type TemplateFile,
  writeDocumentFile,
} from '../../src/model/index.js';
import type { PageTextLines } from '../../src/pagination/index.js';
import type { DocumentSession } from '../../src/session/index.js';
import { documentSchema } from '../../test/document-markup.js';
import { createSessionRooms } from '../../test/session-rooms.js';
import { sampleDocument } from './lab-document.js';
import { markReadyWhenSettled } from './lab-ready.js';
import { LAB_FONTS } from './served-fonts.js';

const DOCUMENT_ID = 'collab-room';

// The lab's document, with a long listing and a long list of contents after it when asked.
function labDocument(): DocumentFile {
  const file = sampleDocument(['Startup', 'Shutdown']);
  if (new URLSearchParams(window.location.search).get('document') !== 'long') return file;
  const lines = Array.from({ length: 90 }, (_, index) => `step ${String(index + 1)} = done`);
  const steps = Array.from({ length: 70 }, (_, index) => ({
    type: 'heading',
    attrs: { level: 2 },
    content: [{ type: 'text', text: `Check ${String(index + 1)}` }],
  }));
  file.sections[0]?.content.push(
    { type: 'codeBlock', content: [{ type: 'text', text: lines.join('\n') }] },
    { type: 'contents', attrs: { kind: 'toc', depth: 2 } },
    ...steps,
  );
  return file;
}

// How the writers' pages lay their text out (`textLayout=pretext`, DOCE-PAGINATION-11).
const TEXT_LAYOUT =
  new URLSearchParams(window.location.search).get('textLayout') === 'pretext' ? 'pretext' : 'dom';
// The writers' served fonts under `textLayout=pretext` (DOCE-HOST-1.14.1).
const FONTS = TEXT_LAYOUT === 'pretext' ? LAB_FONTS : undefined;

const ROOMS = createSessionRooms({ documents: [{ id: DOCUMENT_ID, content: labDocument() }] });

interface Writer {
  id: string;
  name: string;
  /** The writer's column, as a share of the page's width. */
  width: string;
  zoom: number;
}

const WRITERS: readonly Writer[] = [
  { id: 'ada', name: 'Ada', width: '58%', zoom: 100 },
  { id: 'grace', name: 'Grace', width: '40%', zoom: 60 },
];

const hostOf = (person: Writer): EditorHost => ({
  ...createMemoryHost({ person: { id: person.id, name: person.name } }),
  collaboration: ROOMS.adapter(person.id),
});

const HOSTS = new Map(WRITERS.map((person) => [person.id, hostOf(person)]));

function StatusLine({ session, name }: { session: DocumentSession; name: string }) {
  const status = useSessionValue(session.status);
  return <output aria-label={`${name}'s status`}>{`${status.load} · ${status.save}`}</output>;
}

function Connection({ person }: { person: string }) {
  const [online, setOnline] = useState(true);
  return (
    <button
      type="button"
      onClick={() => {
        const provider = ROOMS.providerOf(person);
        if (online) provider?.disconnect();
        else provider?.connect();
        setOnline(!online);
      }}
    >
      {online ? 'Go offline' : 'Go online'}
    </button>
  );
}

/** The shared room lab's probe on `window.collabRoom`. */
export interface CollabRoomProbe {
  /** The text of the document a writer's editor holds, the state its pages project. */
  canonicalText(name: string): string | null;
  /** The attributes only the pages set that a writer's room document holds other than whole. */
  pageOnlyInRoom(name: string): string[];
  /** The document a writer's editor holds, as stored. */
  stored(name: string): DocumentFile | null;
  /** With `textLayout=pretext`, a writer's pages' layout (`pagesLayout()`), or null. */
  layout(name: string): PagesLayout | null;
  /** With `textLayout=pretext`, the lines a writer's pages computed (`textLines()`). */
  textLines(name: string): PageTextLines[];
  /** Resolves once every editor's pages are laid out (`whenSettled`). */
  settled(): Promise<void>;
  /** With `textLayout=pretext`, draws every page of every editor on the engine's lines. */
  drawAllLines(): void;
  /**
   * Where each text block's content is in a writer's document with its pages joined whole, as
   * `[from, to]`, in order.
   */
  textRanges(name: string): [number, number][];
  /** Selects, focused, between two positions of a writer's document with its pages joined whole. */
  select(name: string, from: number, to: number): void;
  /** Writes a document into the room as a service would (`updateRoomDocument`), not as a writer. */
  updateRoom(file: DocumentFile): Promise<boolean>;
  /** Opens a stored document afresh in the third editor, with the writers' template. */
  openFresh(file: DocumentFile): void;
  /** The fresh editor's pages' layout, once it has one. */
  freshLayout(): PagesLayout | null;
}

const STATES = new Map<string, EditorState>();
const HANDLES = new Map<string, RefObject<DocumentEditorHandle | null>>();
const TEMPLATES = new Map<string, TemplateFile>();
const FRESH: { open: ((file: DocumentFile) => void) | null; handle: DocumentEditorHandle | null } =
  { open: null, handle: null };

const viewOf = (name: string) => HANDLES.get(name)?.current?.view() ?? null;

function textRanges(state: EditorState): [number, number][] {
  const ranges: [number, number][] = [];
  state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    ranges.push([pos + 1, pos + node.nodeSize - 1]);
    return false;
  });
  return ranges;
}

const probe: CollabRoomProbe = {
  canonicalText: (name) => STATES.get(name)?.doc.textContent ?? null,
  pageOnlyInRoom: (name) => {
    const person = WRITERS.find((writer) => writer.name === name);
    const doc = person ? ROOMS.providerOf(person.id)?.doc : null;
    const held = doc ? readContent(documentSchema, doc.get('content')) : null;
    const found: string[] = [];
    held?.descendants((node) => {
      for (const [attr, whole] of Object.entries(wholeValuesOf(node.type.name))) {
        const value: unknown = node.attrs[attr];
        if (value !== undefined && value !== whole) found.push(`${node.type.name}.${attr}`);
      }
      return true;
    });
    return found;
  },
  stored: (name) => {
    const state = STATES.get(name);
    return state ? writeDocumentFile(state.doc) : null;
  },
  layout: (name) => HANDLES.get(name)?.current?.pagesLayout() ?? null,
  textLines: (name) => HANDLES.get(name)?.current?.textLines() ?? [],
  settled: async () => {
    const handles = [...HANDLES.values()].map((each) => each.current);
    await Promise.all([...handles, FRESH.handle].map((handle) => handle?.whenSettled()));
  },
  drawAllLines: () => {
    for (const handle of HANDLES.values()) handle.current?.drawAllLines(true);
    FRESH.handle?.drawAllLines(true);
  },
  textRanges: (name) => {
    const view = viewOf(name);
    return view ? textRanges(view.state) : [];
  },
  select: (name, from, to) => {
    const view = viewOf(name);
    if (!view) return;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
    view.focus();
  },
  updateRoom: async (file) => {
    const handle = await ROOMS.server.openRoom(DOCUMENT_ID);
    try {
      return handle.transact({ actor: { id: 'room-service' }, capabilities: [] }, (doc) =>
        updateRoomDocument(doc, file, {
          schema: documentSchema,
          pageTemplate: TEMPLATES.get('Ada'),
        }),
      );
    } finally {
      handle.release();
    }
  },
  openFresh: (file) => FRESH.open?.(file),
  freshLayout: () => FRESH.handle?.pagesLayout() ?? null,
};
Object.assign(window, { collabRoom: probe });

// Keeps the state a writer's editor holds where the probe reads it.
function Canonical({
  name,
  state,
  template,
}: {
  name: string;
  state: EditorState;
  template: TemplateFile;
}) {
  useEffect(() => {
    STATES.set(name, state);
    TEMPLATES.set(name, template);
  }, [name, state, template]);
  return null;
}

// A stored document opened afresh, laid out as the writers' pages are, for comparing with them.
function FreshPane() {
  const [opened, setOpened] = useState<{ state: EditorState; key: number } | null>(null);
  const handle = useRef<DocumentEditorHandle>(null);
  useEffect(() => {
    FRESH.open = (file) => {
      // With the writers' editing plugins (their object views number code), so it is laid out
      // as their pages are.
      const writers = TEMPLATES.values().next().value;
      const state = EditorState.create({
        doc: readDocumentFile(file, documentSchema).doc,
        plugins: createDocumentEditing(documentSchema, writers ? { template: () => writers } : {}),
      });
      setOpened((last) => ({ state, key: (last?.key ?? 0) + 1 }));
    };
  }, []);
  useEffect(() => {
    FRESH.handle = handle.current;
  });
  const template = TEMPLATES.values().next().value;
  if (!opened || !template) return null;
  return (
    <section aria-label="Fresh">
      <DocumentEditor
        key={opened.key}
        state={opened.state}
        onStateChange={(update) =>
          setOpened(
            (last) =>
              last && {
                ...last,
                state: typeof update === 'function' ? update(last.state) : update,
              },
          )
        }
        template={template}
        textLayout={TEXT_LAYOUT}
        fonts={FONTS}
        aria-label="Fresh document"
        handleRef={handle}
      />
    </section>
  );
}

function WriterPane({ person }: { person: Writer }) {
  const [zoom, setZoom] = useState(person.zoom);
  const handle = useRef<DocumentEditorHandle>(null);
  useEffect(() => {
    HANDLES.set(person.name, handle);
  }, [person.name]);
  const [web, setWeb] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const session = useDocumentSession({
    host: HOSTS.get(person.id) ?? hostOf(person),
    documentId: DOCUMENT_ID,
    mode: 'room',
  });
  if (!session) return null;
  return (
    <section aria-label={person.name} style={{ flex: `0 0 ${person.width}`, minWidth: 0 }}>
      <h2>{person.name}</h2>
      <Connection person={person.id} /> <StatusLine session={session} name={person.name} />{' '}
      <label>
        <input
          type="checkbox"
          name={`${person.id}-web-layout`}
          checked={web}
          onChange={(event) => setWeb(event.currentTarget.checked)}
        />{' '}
        {`${person.name}'s web layout`}
      </label>{' '}
      <label>
        <input
          type="checkbox"
          name={`${person.id}-suggesting`}
          checked={suggesting}
          onChange={(event) => setSuggesting(event.currentTarget.checked)}
        />{' '}
        {`${person.name} suggests`}
      </label>
      <DocumentSessionBoundary
        session={session}
        fallback={<p>Opening the document…</p>}
        renderError={(error) => (
          <p role="alert">{`The document did not open: ${error?.kind ?? 'unknown'}`}</p>
        )}
      >
        {(props) => (
          <>
            <Canonical name={person.name} state={props.state} template={props.template} />
            <DocumentEditor
              {...props}
              aria-label={`${person.name}'s document`}
              zoom={zoom}
              onZoomChange={setZoom}
              layout={web ? 'web' : 'page'}
              suggesting={suggesting}
              textLayout={TEXT_LAYOUT}
              fonts={FONTS}
              handleRef={handle}
            />
          </>
        )}
      </DocumentSessionBoundary>
    </section>
  );
}

const container = document.querySelector('#lab-editor');
if (container) {
  createRoot(container).render(
    <>
      <div style={{ display: 'flex', gap: '2%', alignItems: 'flex-start' }}>
        {WRITERS.map((person) => (
          <WriterPane key={person.id} person={person} />
        ))}
      </div>
      <FreshPane />
    </>,
  );
  markReadyWhenSettled();
}
