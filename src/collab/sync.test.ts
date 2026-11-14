import * as Y from '@y/y';
import * as delta from 'lib0/delta';
import type { Node } from 'prosemirror-model';
import { Plugin, TextSelection } from 'prosemirror-state';
import { describe, expect, it, vi } from 'vitest';
import {
  type HeadlessEditor,
  headlessEditor,
  readFixture,
  sharedDocument,
  undoManagerOf,
} from '../../test/collab-fixtures.js';
import { documentSchema } from '../../test/document-markup.js';
import { createDocumentEditing } from '../engine/document-editing.js';
import { isRemoteTransaction, isSystemChange } from '../engine/transaction-kind.js';
import { BASE_TEMPLATE, type DocumentFile } from '../model/index.js';
import { readCollabChange } from './sync.js';

const FILE: DocumentFile = {
  formatVersion: 1,
  sections: [
    {
      name: null,
      content: [
        {
          type: 'heading',
          attrs: { level: 1, id: 'a0000001' },
          content: [{ type: 'text', text: 'Title' }],
        },
        {
          type: 'paragraph',
          attrs: { id: 'a0000002' },
          content: [{ type: 'text', text: 'First paragraph.' }],
        },
        {
          type: 'paragraph',
          attrs: { id: 'a0000003' },
          content: [
            { type: 'text', text: 'Second ' },
            { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' paragraph.' },
          ],
        },
      ],
    },
  ],
};

const start = (): Node => readFixture(FILE);

// A ProseMirror node's text, not a DOM node's.
const textOf = (node: Node): string => node.textContent;

function markType(name: string) {
  const type = documentSchema.marks[name];
  if (!type) throw new Error(`No mark type ${name}.`);
  return type;
}

function textblocks(doc: Node): { node: Node; from: number; to: number }[] {
  const found: { node: Node; from: number; to: number }[] = [];
  doc.descendants((node, pos) => {
    if (node.isTextblock) found.push({ node, from: pos + 1, to: pos + node.nodeSize - 1 });
    return !node.isTextblock;
  });
  return found;
}

function block(doc: Node, n: number) {
  const found = textblocks(doc)[n];
  if (!found) throw new Error(`No textblock ${String(n)}.`);
  return found;
}

const typeAtEnd = (editor: HeadlessEditor, n: number, text: string) => {
  editor.dispatch(editor.state.tr.insertText(text, block(editor.state.doc, n).to));
};

/** Two editors on two Yjs documents that exchange updates when `sync` runs. */
function pair(options: { manual?: boolean } = {}) {
  const a = headlessEditor(start(), options);
  const docB = new Y.Doc();
  Y.applyUpdate(docB, Y.encodeStateAsUpdate(a.doc));
  const b = headlessEditor(start(), { ...options, doc: docB });
  const sync = () => {
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc, Y.encodeStateVector(b.doc)), 'network');
    Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc, Y.encodeStateVector(a.doc)), 'network');
  };
  return { a, b, sync };
}

const settle = () => new Promise<void>((resolve) => queueMicrotask(resolve));

function expectConverged(...editors: HeadlessEditor[]) {
  const [first] = editors;
  if (!first) return;
  for (const editor of editors) {
    expect(editor.state.doc.toJSON()).toEqual(first.state.doc.toJSON());
    expect(sharedDocument(editor.doc)?.toJSON()).toEqual(editor.state.doc.toJSON());
  }
}

describe('collab sync', () => {
  it('DOCE-COLLAB-4.1 sends typing, splits, marks and attributes both ways', async () => {
    const { a, b, sync } = pair();
    typeAtEnd(a, 1, ' Typed by A.');
    sync();
    await settle();
    expect(textOf(b.state.doc)).toMatch(/Typed by A\./);
    b.dispatch(b.state.tr.split(block(b.state.doc, 1).to - 3));
    const title = block(b.state.doc, 0);
    b.dispatch(b.state.tr.addMark(title.from, title.from + 3, markType('em').create()));
    b.dispatch(b.state.tr.setNodeAttribute(title.from - 1, 'level', 2));
    sync();
    await settle();
    expectConverged(a, b);
    expect(block(a.state.doc, 0).node.attrs.level).toBe(2);
    expect(textblocks(a.state.doc)).toHaveLength(4);
  });

  it('DOCE-COLLAB-4.1 keeps the local selection on its text when a shared change lands', async () => {
    const { a, b, sync } = pair();
    const caret = block(a.state.doc, 2).to;
    a.dispatch(a.state.tr.setSelection(TextSelection.create(a.state.doc, caret)));
    b.dispatch(b.state.tr.insertText('Before. ', block(b.state.doc, 1).from));
    sync();
    await settle();
    expect(a.state.selection.head).toBe(caret + 'Before. '.length);
  });

  it('DOCE-COLLAB-4.1 binds one view at a time, so a second view replays nothing twice', async () => {
    const { a, b, sync } = pair();
    const plugin = b.state.plugins.find((each) => each.spec.measured === false);
    const dispatched: unknown[] = [];
    const hidden = { state: b.state, dispatch: (tr: unknown) => dispatched.push(tr) };
    plugin?.spec.view?.(hidden as never);
    typeAtEnd(a, 1, ' once');
    sync();
    await settle();
    expect(dispatched).toEqual([]);
    expect(textOf(block(b.state.doc, 1).node)).toBe('First paragraph. once');
    expectConverged(a, b);
  });

  it('DOCE-COLLAB-4.2 takes the shared document’s content over the editor’s when it joins', async () => {
    const a = headlessEditor(start());
    typeAtEnd(a, 1, ' Shared.');
    const docB = new Y.Doc();
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(a.doc));
    const b = headlessEditor(start(), { doc: docB });
    await settle();
    expect(textOf(b.state.doc)).toMatch(/Shared\./);
    expect(isRemoteTransaction(b.dispatched[0] ?? b.state.tr)).toBe(true);
    expectConverged(a, b);
  });

  it('DOCE-COLLAB-4.2 seeds an empty shared document with the editor’s document, ids given first', async () => {
    const editor = headlessEditor(
      readFixture({
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'No id.' }] }],
          },
        ],
      }),
    );
    const seeded = sharedDocument(editor.doc);
    const ids: unknown[] = [];
    seeded?.descendants((node) => {
      if (node.isTextblock) ids.push(node.attrs.dataId);
    });
    expect(ids.every((id) => typeof id === 'string' && /^[a-f0-9]{8}$/.test(id))).toBe(true);
    await settle();
    expect(isSystemChange(editor.dispatched[0] ?? editor.state.tr)).toBe(true);
    expect(editor.state.doc.toJSON()).toEqual(seeded?.toJSON());
  });

  it('DOCE-COLLAB-4.3 marks shared changes remote, out of the history, with their origins', async () => {
    const { a, b, sync } = pair();
    typeAtEnd(a, 1, ' A');
    sync();
    await settle();
    const [tr] = b.dispatched.slice(-1);
    expect(tr && isRemoteTransaction(tr)).toBe(true);
    expect(tr?.getMeta('addToHistory')).toBe(false);
    expect(tr && readCollabChange(tr)).toEqual({ kind: 'remote', origins: ['network'] });
    expect(readCollabChange(a.state.tr)).toBeNull();
  });

  it('DOCE-COLLAB-4.3 brings changes of the host’s own origins as system changes', async () => {
    const { a, b } = pair();
    const host = headlessEditor(start(), {
      doc: a.doc,
      isRemoteOrigin: (from) => from === 'network',
    });
    typeAtEnd(b, 1, ' restored');
    Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc, Y.encodeStateVector(a.doc)), 'restored');
    await settle();
    const tr = host.dispatched.at(-1);
    expect(tr && readCollabChange(tr)).toEqual({ kind: 'system', origins: ['restored'] });
    expect(tr && isSystemChange(tr)).toBe(true);
    expect(tr && isRemoteTransaction(tr)).toBe(false);
  });

  it('DOCE-COLLAB-4.3 brings the editor’s own undo at once, as an undo', () => {
    const editor = headlessEditor(start());
    const undo = undoManagerOf(editor);
    typeAtEnd(editor, 2, ' mine');
    undo.undo();
    const tr = editor.dispatched.at(-1);
    expect(tr && readCollabChange(tr)?.kind).toBe('undo');
    expect(tr && isRemoteTransaction(tr)).toBe(false);
    expect(textOf(editor.state.doc)).not.toMatch(/ mine/);
  });
});

describe('collab sync coalescing', () => {
  it('DOCE-COLLAB-4.4 schedules with the platform’s queueMicrotask called on its own', async () => {
    const platform = globalThis.queueMicrotask.bind(globalThis);
    // As browsers do, refuse a call with another receiver than the global object.
    vi.stubGlobal('queueMicrotask', function (this: unknown, run: () => void) {
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
      platform(run);
    });
    const { a, b, sync } = pair();
    typeAtEnd(a, 1, ' Scheduled.');
    sync();
    await settle();
    expect(textOf(b.state.doc)).toMatch(/Scheduled\./);
  });

  it('DOCE-COLLAB-4.4 brings a burst of shared changes in one transaction', () => {
    const { a, b, sync } = pair({ manual: true });
    for (const word of [' one', ' two', ' three']) {
      typeAtEnd(a, 1, word);
      sync();
    }
    const before = b.dispatched.length;
    b.runScheduled();
    expect(b.dispatched.length - before).toBe(1);
    expect(textOf(block(b.state.doc, 1).node)).toBe('First paragraph. one two three');
  });

  it('DOCE-COLLAB-4.4 moves local changes made before the burst lands after it', () => {
    const { a, b, sync } = pair({ manual: true });
    typeAtEnd(a, 1, ' from A');
    sync();
    typeAtEnd(b, 1, ' from B');
    b.dispatch(
      b.state.tr.setSelection(TextSelection.create(b.state.doc, block(b.state.doc, 1).to)),
    );
    b.runScheduled();
    expect(textOf(block(b.state.doc, 1).node)).toBe('First paragraph. from A from B');
    expect(b.state.selection.head).toBe(block(b.state.doc, 1).to);
    sync();
    a.runScheduled();
    expectConverged(a, b);
  });

  it('DOCE-COLLAB-4.4 moves changes a late view has not sent yet after the shared ones', () => {
    const { a, b, sync } = pair({ manual: true });
    b.lagging = true;
    typeAtEnd(b, 2, ' late');
    typeAtEnd(a, 2, ' early');
    sync();
    b.runScheduled();
    b.catchUp();
    expect(textOf(block(b.state.doc, 2).node)).toBe('Second bold paragraph. early late');
    sync();
    a.runScheduled();
    expectConverged(a, b);
  });
});

describe('collab sync derived writes', () => {
  // A plugin that writes in response to every change, remote ones included, as a host's might.
  const stampHeadings = new Plugin({
    appendTransaction(_transactions, _old, state) {
      const tr = state.tr;
      state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading' && node.attrs.className !== 'seen') {
          tr.setNodeAttribute(pos, 'className', 'seen');
        }
      });
      return tr.docChanged ? tr : null;
    },
  });

  it('DOCE-COLLAB-2.2 sends a change a plugin appends to a shared one as the editor’s, not to undo', async () => {
    const a = headlessEditor(start());
    const docB = new Y.Doc();
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(a.doc));
    const b = headlessEditor(start(), { doc: docB, plugins: [stampHeadings] });
    await settle();
    const undo = undoManagerOf(b);
    const sync = () => {
      Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc, Y.encodeStateVector(b.doc)), 'network');
      Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc, Y.encodeStateVector(a.doc)), 'network');
    };
    a.dispatch(a.state.tr.setNodeAttribute(block(a.state.doc, 0).from - 1, 'level', 2));
    sync();
    await settle();
    sync();
    await settle();
    expect(block(a.state.doc, 0).node.attrs.className).toBe('seen');
    expect(undo.canUndo()).toBe(false);
    expectConverged(a, b);
  });

  it('DOCE-COLLAB-2.2 DOCE-EDITING-3.3 sends nothing back for a shared change the editing plugins receive', async () => {
    const template = () => BASE_TEMPLATE;
    const plugins = createDocumentEditing(documentSchema, { template, history: false });
    const a = headlessEditor(start(), { plugins });
    const docB = new Y.Doc();
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(a.doc));
    const b = headlessEditor(start(), { doc: docB, plugins });
    await settle();
    const sent: Uint8Array[] = [];
    b.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin !== 'network') sent.push(update);
    });
    a.dispatch(a.state.tr.split(block(a.state.doc, 1).to - 4));
    typeAtEnd(a, 2, ' and more');
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc, Y.encodeStateVector(b.doc)), 'network');
    await settle();
    expect(sent).toEqual([]);
    expect(b.state.doc.toJSON()).toEqual(a.state.doc.toJSON());
  });
});

// Another reader's copy of an editor's shared document, with a block after the first paragraph of
// a type the editor's schema lacks, as an editor on a newer schema writes.
function newerCopy(editor: HeadlessEditor): Y.Doc {
  const newer = new Y.Doc();
  Y.applyUpdate(newer, Y.encodeStateAsUpdate(editor.doc));
  const below = (type: Y.Type, index: number) => type.get(index) as Y.Type;
  const blocks = below(below(below(newer.get('content'), 0), 0), 1);
  const added = delta.create('hologram').insert('Seen from every side.').done();
  blocks.applyDelta(delta.create().retain(1).insert([added]).done() as never);
  return newer;
}

const bringFrom = (editor: HeadlessEditor, from: Y.Doc) => {
  Y.applyUpdate(
    editor.doc,
    Y.encodeStateAsUpdate(from, Y.encodeStateVector(editor.doc)),
    'network',
  );
};

describe('collab sync on a shared document its schema cannot read', () => {
  it('DOCE-COLLAB-4.7 stops and tells of a block of a type its schema lacks', () => {
    const told: unknown[] = [];
    const editor = headlessEditor(start(), { onUnreadable: (error) => told.push(error) });
    const newer = newerCopy(editor);
    bringFrom(editor, newer);
    expect(told).toHaveLength(1);
    expect(String(told[0])).toContain('hologram');
    // Nothing the reader types reaches the shared document, which the editor no longer shows.
    const held = Y.encodeStateAsUpdate(editor.doc);
    typeAtEnd(editor, 0, '!');
    editor.destroy();
    expect(Y.encodeStateAsUpdate(editor.doc)).toEqual(held);
    // And nothing more comes from it, so the editor is told once.
    newer.get('content').setAttr('width', 1);
    bringFrom(editor, newer);
    expect(told).toHaveLength(1);
    expect(textOf(block(editor.state.doc, 0).node)).toBe('Title!');
  });

  it('DOCE-COLLAB-4.7 stops as it binds to a shared document its schema cannot read', () => {
    const first = headlessEditor(start());
    const newer = newerCopy(first);
    const told: unknown[] = [];
    const editor = headlessEditor(start(), {
      doc: newer,
      onUnreadable: (error) => told.push(error),
    });
    expect(told).toHaveLength(1);
    const held = Y.encodeStateAsUpdate(newer);
    typeAtEnd(editor, 0, '!');
    expect(Y.encodeStateAsUpdate(newer)).toEqual(held);
  });

  it('DOCE-COLLAB-4.7 throws what it cannot read when nobody is told, and stops', () => {
    const editor = headlessEditor(start());
    const newer = newerCopy(editor);
    expect(() => bringFrom(editor, newer)).toThrow(/hologram/);
    const held = Y.encodeStateAsUpdate(editor.doc);
    typeAtEnd(editor, 0, '!');
    expect(Y.encodeStateAsUpdate(editor.doc)).toEqual(held);
  });
});
