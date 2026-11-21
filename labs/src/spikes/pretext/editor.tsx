import { EditorState } from 'prosemirror-state';
import { useLayoutEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DocumentEditor, type DocumentMarkup } from '../../../../src/components/index.js';
import { createDocumentEditing, repairElementIds } from '../../../../src/engine/index.js';
import { createMemoryHost, type EditingMode } from '../../../../src/host/index.js';
import { BASE_TEMPLATE, writeDocumentFile } from '../../../../src/model/index.js';
import { fixture, readFixture, schema, type Workload } from './fixtures.js';

function openDraft(name: Workload) {
  const file = fixture(name);
  const host = createMemoryHost({ person: { id: 'writer', name: 'Lab Writer' }, comments: {} });
  const state = EditorState.create({
    doc: readFixture(file),
    plugins: createDocumentEditing(schema, {
      template: () => BASE_TEMPLATE,
      author: () => host.identity.currentPerson().id,
    }),
  });
  const repair = repairElementIds(state);
  let saved = repair ? state.apply(repair) : state;
  const plugins = state.plugins;
  return {
    name,
    host,
    template: file.template ?? null,
    readState: () => saved,
    keepState(next: EditorState) {
      // A new view installs its own view-bound plugins. Retain the canonical
      // editing plugins, including their undo history, between mounts.
      saved = next.reconfigure({ plugins });
    },
  };
}

type Draft = ReturnType<typeof openDraft>;

function FixtureEditor({ draft, ready }: { draft: Draft; ready: () => void }) {
  const [state, setState] = useState(draft.readState);
  const latest = useRef(state);
  const [mode, setMode] = useState<EditingMode>('edit');
  const [markup, setMarkup] = useState<DocumentMarkup>('all');
  const [zoom, setZoom] = useState(100);
  useLayoutEffect(() => {
    latest.current = state;
  }, [state]);
  useLayoutEffect(() => () => draft.keepState(latest.current), [draft]);
  const { identity, comments } = draft.host;
  return (
    <DocumentEditor
      state={state}
      onStateChange={setState}
      template={BASE_TEMPLATE}
      author={identity.currentPerson().id}
      editable={mode === 'edit' || mode === 'suggest'}
      suggesting={mode === 'suggest'}
      onModeChange={setMode}
      markup={markup}
      onMarkupChange={setMarkup}
      zoom={zoom}
      onZoomChange={setZoom}
      comments={
        comments && {
          store: comments,
          identity,
          documentId: draft.name,
          presentation: 'cards',
          canComment: mode !== 'read',
        }
      }
      onLayoutReady={ready}
      toolbar
      menubar
      statusBar
      tableHandles
      find
      scrollable
      aria-label="Fixture editor"
    />
  );
}

/** Drafts and comment stores live until reload. Only the active editor owns a view. */
export function createFixtureEditors(container: HTMLElement) {
  const drafts = new Map<Workload, Draft>();
  let root: Root | undefined;
  return {
    show(name: Workload, ready: () => void) {
      const draft = drafts.get(name) ?? openDraft(name);
      drafts.set(name, draft);
      root ??= createRoot(container);
      root.render(<FixtureEditor key={name} draft={draft} ready={ready} />);
    },
    file(name: Workload) {
      const draft = drafts.get(name);
      if (!draft) return fixture(name);
      return writeDocumentFile(draft.readState().doc, { template: draft.template });
    },
    close() {
      root?.unmount();
      root = undefined;
    },
  };
}
