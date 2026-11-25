// Presence by element address (DOCE-COLLAB-1.7): two people hold their own copies of one document,
// with no shared Yjs document, as hosts in store mode do. Each editor shares its selection by
// address (`presenceSelection`), and the other turns it into positions in its own copy when it sets
// the peers (`setPeers` with `at`). Grace's copy has a paragraph more at its start, so the same
// address is at another position there; a paragraph only Ada's copy holds gives Grace no caret.

import { EditorState } from 'prosemirror-state';
import { useRef, useState } from 'react';
import { DocumentEditor } from '../../src/components/index.js';
import {
  createDocumentEditing,
  createPresence,
  type PresenceRange,
  presenceSelection,
  setPeers,
} from '../../src/engine/index.js';
import {
  BASE_TEMPLATE,
  BASE_TEMPLATE_ID,
  createDocumentSchema,
  type DocumentFile,
  readDocumentFile,
  resolveTemplateFile,
  type StoredNode,
} from '../../src/model/index.js';
import { text } from './lab-document.js';
import { LAB_FONTS } from './served-fonts.js';

const schema = createDocumentSchema();

const TEMPLATE = resolveTemplateFile(BASE_TEMPLATE, {
  loadTemplate: (id) => (id === BASE_TEMPLATE_ID ? BASE_TEMPLATE : null),
  baseTemplateId: BASE_TEMPLATE_ID,
});

const paragraph = (id: string, words: string): StoredNode => ({
  type: 'paragraph',
  attrs: { id },
  content: [text(words)],
});

const copyOf = (blocks: StoredNode[]): DocumentFile => ({
  formatVersion: 1,
  sections: [{ name: null, content: blocks }],
});

const SHARED = [
  paragraph('b0000001', 'Select a word here to show it in the other copy.'),
  paragraph('b0000002', 'Each copy finds this sentence by its element id.'),
];

const COPIES = {
  ada: copyOf([...SHARED, paragraph('b0000003', 'Only Ada’s copy holds this sentence.')]),
  grace: copyOf([paragraph('b0000004', 'Only Grace’s copy holds this sentence.'), ...SHARED]),
};

const PEOPLE = { ada: 'Ada Lovelace', grace: 'Grace Hopper' } as const;

type Person = keyof typeof PEOPLE;

// A person's copy, with the presence plugin that draws the other's caret.
const createState = (person: Person): EditorState =>
  EditorState.create({
    doc: readDocumentFile(COPIES[person], schema).doc,
    plugins: [createPresence(), ...createDocumentEditing(schema, { author: () => person })],
  });

const other = (person: Person): Person => (person === 'ada' ? 'grace' : 'ada');

/** Two copies of a document in store mode, each showing the other's selection by address. */
export function PresenceByAddress() {
  const [states, setStates] = useState<Record<Person, EditorState>>(() => ({
    ada: createState('ada'),
    grace: createState('grace'),
  }));
  // The latest states, which several changes in one frame each build on.
  const latest = useRef(states);
  const [shared, setShared] = useState<Record<Person, PresenceRange | null>>({
    ada: null,
    grace: null,
  });
  // A person's change: their copy takes it, and the other copy sets them as its peer by the
  // address of their selection.
  const change =
    (person: Person) => (update: EditorState | ((last: EditorState) => EditorState)) => {
      const last = latest.current;
      const next = typeof update === 'function' ? update(last[person]) : update;
      const at = presenceSelection(next);
      const peer = other(person);
      const placed = last[peer].apply(
        setPeers(last[peer], [{ id: person, name: PEOPLE[person], at }]),
      );
      latest.current = { ...last, [person]: next, [peer]: placed } as Record<Person, EditorState>;
      setShared((before) => ({ ...before, [person]: at }));
      setStates(latest.current);
    };
  return (
    <section aria-label="Presence by address">
      <h2>Presence by address</h2>
      <div className="lab-presence">
        {(['ada', 'grace'] as const).map((person) => (
          <div key={person} className="lab-presence__pane">
            <h3>{PEOPLE[person]}</h3>
            <output aria-label={`${PEOPLE[person]}’s shared address`}>
              {shared[person]
                ? `${shared[person].head.elementId} at ${String(shared[person].head.offset)}`
                : 'none'}
            </output>
            <DocumentEditor
              fonts={LAB_FONTS}
              state={states[person]}
              onStateChange={change(person)}
              template={TEMPLATE}
              layout="web"
              toolbar={false}
              aria-label={`${PEOPLE[person]}’s copy`}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
