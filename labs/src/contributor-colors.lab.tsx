// Contributor colours: a document twelve people wrote, more than the default eight colour slots,
// each present with a caret on their own paragraph. Authorship shows, and the contributors pane
// lists them beside the document. The host picks the editor's count of colour slots (`colorSlots`):
// with 8 some writers share a colour; with 50 each has one no other writer has, on their text,
// their caret and their avatar. The lab's sheet colours as many slots as it sets.

import { EditorState } from 'prosemirror-state';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DocumentContributors, DocumentEditor } from '../../src/components/index.js';
import {
  createDocumentEditing,
  createPresence,
  type Peer,
  setPeers,
} from '../../src/engine/index.js';
import type { EditorPerson, IdentityAdapter } from '../../src/host/index.js';
import {
  BASE_TEMPLATE,
  createDocumentSchema,
  type DocumentFile,
  readDocumentFile,
} from '../../src/model/index.js';
import { heading, text } from './lab-document.js';
import { markReadyWhenSettled } from './lab-ready.js';
import { LAB_FONTS } from './served-fonts.js';

const WRITERS = [
  ['ada', 'Ada Lovelace'],
  ['alan', 'Alan Turing'],
  ['barbara', 'Barbara Liskov'],
  ['claude', 'Claude Shannon'],
  ['donald', 'Donald Knuth'],
  ['edsger', 'Edsger Dijkstra'],
  ['frances', 'Frances Allen'],
  ['grace', 'Grace Hopper'],
  ['john', 'John Backus'],
  ['katherine', 'Katherine Johnson'],
  ['margaret', 'Margaret Hamilton'],
  ['radia', 'Radia Perlman'],
] as const;

const SLOT_CHOICES = [8, 50] as const;

const DOCUMENT: DocumentFile = {
  formatVersion: 1,
  sections: [
    {
      name: null,
      content: [
        { ...heading(1, 'Twelve writers'), attrs: { level: 1, id: 'c0000000', author: 'ada' } },
        ...WRITERS.map(([id, name], index) => ({
          type: 'paragraph',
          attrs: { id: `c00000${String(index + 10)}`, author: id },
          content: [text(`${name} wrote this paragraph, and their caret rests at its start.`)],
        })),
      ],
    },
  ],
};

// Each writer present, their caret at the start of the paragraph they wrote.
function peersOf(state: EditorState): Peer[] {
  const starts = new Map<string, number>();
  state.doc.descendants((node, pos) => {
    const author = node.attrs.dataAuthor as string | null | undefined;
    if (node.type.name === 'paragraph' && author) starts.set(author, pos + 1);
    return !node.isTextblock;
  });
  return WRITERS.map(([id, name]) => ({ id, name, head: starts.get(id), anchor: starts.get(id) }));
}

function initialState(): EditorState {
  const schema = createDocumentSchema();
  const state = EditorState.create({
    doc: readDocumentFile(DOCUMENT, schema).doc,
    plugins: [
      ...createDocumentEditing(schema, { template: () => BASE_TEMPLATE }),
      createPresence(),
    ],
  });
  return state.apply(setPeers(state, peersOf(state)));
}

// A colour for each of `count` slots, hues spread by the golden angle so neighbours differ, in
// two lightnesses: the lab's sheet for the carets, the authorship tints and the avatars, darker
// where white text sits on the colour.
function slotSheet(count: number): string {
  return Array.from({ length: count }, (_, slot) => {
    const color = `hsl(${String(Math.round((slot * 137.508) % 360))} 70% ${slot % 2 ? '38%' : '48%'})`;
    // Darkened where white text sits on it, so names and initials keep their contrast.
    const ink = `color-mix(in srgb, ${color} 55%, black)`;
    return [
      `.de-presence-caret[data-presence-slot='${String(slot)}'],`,
      `.de-presence-selection[data-presence-slot='${String(slot)}'] { --de-presence-fallback: ${ink}; }`,
      `.lab-slots .de-document-editor[data-authorship='true'] [data-author-slot='${String(slot)}'] { background: color-mix(in srgb, ${color} 22%, transparent); }`,
      `.lab-slots :is(.ui-avatar, .ui-avatar-group__dot)[data-color='${String(slot)}'] { --ref-avatar-color: ${ink}; }`,
    ].join('\n');
  }).join('\n');
}

function Lab() {
  const [state, setState] = useState(initialState);
  const [slots, setSlots] = useState<number>(50);
  return (
    <div className="lab-slots">
      <style>{slotSheet(slots)}</style>
      <fieldset>
        <legend>Host</legend>
        <label>
          Colour slots{' '}
          <select value={slots} onChange={(event) => setSlots(Number(event.currentTarget.value))}>
            {SLOT_CHOICES.map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
      <DocumentEditor
        fonts={LAB_FONTS}
        state={state}
        onStateChange={setState}
        template={BASE_TEMPLATE}
        colorSlots={slots}
        authorship
        aria-label="Sample document"
      >
        <aside className="lab-panels" aria-label="Contributors">
          <DocumentContributors identity={IDENTITY} />
        </aside>
      </DocumentEditor>
    </div>
  );
}

// The identity adapter's people: each writer by their name.
const PEOPLE: readonly EditorPerson[] = WRITERS.map(([id, name]) => ({ id, name }));
const IDENTITY: IdentityAdapter = {
  currentPerson: () => ({ id: 'reader', name: 'Reader' }),
  findPeople: (query) =>
    Promise.resolve(PEOPLE.filter((person) => person.name.toLowerCase().includes(query))),
  resolvePeople: (ids) => Promise.resolve(PEOPLE.filter((person) => ids.includes(person.id))),
};

const container = document.querySelector('#lab-editor');
if (container) {
  createRoot(container).render(<Lab />);
  markReadyWhenSettled();
}
