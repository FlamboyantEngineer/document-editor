// Spike (P0-10): two people edit one document through an in-process collaboration-tools room. Each
// editor shows its whole-document state through the library's own binding, with its own undo, the
// other person's caret, and the time its latest local and remote changes took.

import type { RoomProvider } from '@flamboyantengineer/collaboration-tools/client';
import { keymap } from 'prosemirror-keymap';
import type { Node } from 'prosemirror-model';
import { EditorState, type Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import {
  createDocumentEditing,
  createPresence,
  isRemoteTransaction,
  presenceKey,
  setPeers,
} from '../../../src/engine/index.js';
import {
  createDocumentSchema,
  type DocumentFile,
  readDocumentFile,
} from '../../../src/model/index.js';
import { longDocument } from '../stress/stress-documents.js';
import { publishCaret, readPeers } from './collab-awareness.js';
import { bindState, type CollabBinding } from './collab-binding.js';
import { documentToUpdate } from './collab-convert.js';
import { createInProcessRoom, type InProcessRoom, whenSynced } from './collab-room.js';

const schema = createDocumentSchema();

const SAMPLE: DocumentFile = {
  formatVersion: 1,
  sections: [
    {
      name: null,
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Shared notes' }] },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Both editors hold this document. Type in either one.' }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Undo in one editor undoes only that person’s changes.' },
          ],
        },
      ],
    },
  ],
};

const SIZES: Record<string, () => DocumentFile> = {
  sample: () => SAMPLE,
  '20': () => longDocument(20),
  '150': () => longDocument(150),
};

const PEOPLE = [
  { id: 'ada', name: 'Ada Lovelace' },
  { id: 'grace', name: 'Grace Hopper' },
] as const;

const ms = (value: number) => `${value.toFixed(2)} ms`;

function output(pane: Element, name: string): HTMLOutputElement {
  const found = pane.querySelector<HTMLOutputElement>(`output[name="${name}"]`);
  if (!found) throw new Error(`No output ${name}.`);
  return found;
}

// One person's editor: a view on their binding, their caret published and the other's drawn.
function mountEditor(
  pane: Element,
  provider: RoomProvider,
  person: (typeof PEOPLE)[number],
  doc: Node,
): { binding: CollabBinding; view: EditorView } {
  let binding: CollabBinding | null = null;
  const undo = () => binding?.undo() ?? false;
  const redo = () => binding?.redo() ?? false;
  const state = EditorState.create({
    doc,
    plugins: [
      createPresence(),
      keymap({ 'Mod-z': undo, 'Mod-y': redo, 'Mod-Shift-z': redo }),
      ...createDocumentEditing(schema, {
        history: false,
        isRemote: isRemoteTransaction,
        author: () => person.id,
      }),
    ],
  });
  let started = performance.now();
  const bound = bindState({ doc: provider.doc, state });
  console.info(`${person.id}: bound in ${ms(performance.now() - started)}`);
  started = performance.now();
  binding = bound;
  const host = pane.querySelector('.lab-collab__editor') as HTMLElement;
  const view = new EditorView(host, {
    state: bound.state,
    dispatchTransaction: (tr: Transaction) => {
      bound.dispatch(tr);
    },
  });
  console.info(`${person.id}: drawn in ${ms(performance.now() - started)}`);
  const refreshPeers = () => {
    bound.dispatch(setPeers(bound.state, readPeers(provider.awareness, provider.doc, bound.state)));
  };
  bound.subscribe((next, tr) => {
    view.updateState(next);
    if (tr.getMeta(presenceKey) !== undefined) return;
    output(pane, 'local').value = ms(bound.timings.local);
    output(pane, 'remote').value = ms(bound.timings.remote);
    publishCaret(provider.awareness, provider.doc, next, person);
    // The other person's caret is at a relative position; the document moved under it.
    if (tr.docChanged) queueMicrotask(refreshPeers);
  });
  provider.awareness.on('change', () => {
    queueMicrotask(refreshPeers);
  });
  publishCaret(provider.awareness, provider.doc, bound.state, person);
  pane.querySelector('[data-action="undo"]')?.addEventListener('click', () => {
    undo();
    view.focus();
  });
  pane.querySelector('[data-action="redo"]')?.addEventListener('click', () => {
    redo();
    view.focus();
  });
  const online = pane.querySelector<HTMLInputElement>('input[name="online"]');
  online?.addEventListener('change', () => {
    if (online.checked) provider.connect();
    else provider.disconnect();
  });
  const status = output(pane, 'status');
  const showStatus = () => {
    const { status: connection, synced, hasUnconfirmedChanges } = provider.getState();
    status.value = `${connection}${synced ? ', synced' : ''}${hasUnconfirmedChanges ? ', unconfirmed changes' : ''}`;
  };
  provider.subscribe(showStatus);
  showStatus();
  return { binding: bound, view };
}

let open: { room: InProcessRoom; views: EditorView[]; bindings: CollabBinding[] } | null = null;

async function load(size: string): Promise<void> {
  document.documentElement.dataset.labReady = 'false';
  if (open) {
    for (const view of open.views) view.destroy();
    for (const binding of open.bindings) binding.destroy();
    await open.room.close();
  }
  const file = (SIZES[size] ?? SIZES.sample)?.() ?? SAMPLE;
  const doc = readDocumentFile(file, schema).doc;
  const started = performance.now();
  const seed = documentToUpdate(doc);
  output(document.body, 'seed').value =
    `${(seed.byteLength / 1024).toFixed(0)} KB in ${ms(performance.now() - started)}`;
  const room = createInProcessRoom(seed);
  const opening = performance.now();
  const panes = [...document.querySelectorAll('.lab-collab__pane')];
  const providers = PEOPLE.map((person) => room.join(person.id));
  await Promise.all(providers.map(whenSynced));
  const synced = performance.now();
  const mounted = PEOPLE.map((person, index) =>
    mountEditor(panes[index] as Element, providers[index] as RoomProvider, person, doc),
  );
  const shown = performance.now();
  output(document.body, 'open').value =
    `synced in ${ms(synced - opening)}, two editors bound and drawn in ${ms(shown - synced)}`;
  open = { room, views: mounted.map((m) => m.view), bindings: mounted.map((m) => m.binding) };
  const traffic = output(document.body, 'traffic');
  const showTraffic = () => {
    const { sent, received } = room.traffic();
    traffic.value = `${(sent / 1024).toFixed(1)} KB sent, ${(received / 1024).toFixed(1)} KB received`;
  };
  for (const binding of open.bindings) binding.subscribe(showTraffic);
  showTraffic();
  document.documentElement.dataset.labReady = 'true';
}

const sizePicker = document.querySelector<HTMLSelectElement>('select[name="size"]');
sizePicker?.addEventListener('change', () => {
  void load(sizePicker.value);
});
void load(sizePicker?.value ?? 'sample');
