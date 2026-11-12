import * as Y from '@y/y';
import type { Node } from 'prosemirror-model';
import { Plugin } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import {
  type HeadlessEditor,
  headlessEditor,
  readFixture,
  sharedDocument,
} from '../../test/collab-fixtures.js';
import { documentSchema } from '../../test/document-markup.js';
import { createDocumentEditing } from '../engine/document-editing.js';
import { isRemoteTransaction } from '../engine/transaction-kind.js';
import { redoCommand, undoCommand } from '../engine/undo-commands.js';
import type { DocumentFile } from '../model/index.js';
import { readCollabChange } from './sync.js';
import { createCollabUndo } from './undo.js';

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
      ],
    },
  ],
};

function paragraphEnd(doc: Node, n: number): number {
  let found = -1;
  let index = 0;
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (index === n) found = pos + node.nodeSize - 1;
    index += 1;
    return false;
  });
  if (found < 0) throw new Error(`No textblock ${String(n)}.`);
  return found;
}

const type = (editor: HeadlessEditor, n: number, text: string) => {
  editor.dispatch(editor.state.tr.insertText(text, paragraphEnd(editor.state.doc, n)));
};

const run = (editor: HeadlessEditor, command: typeof undoCommand) =>
  command(editor.state, (tr) => editor.dispatch(tr));

const settle = () => new Promise<void>((resolve) => queueMicrotask(resolve));

/** Two editors, each with its own undo, on two Yjs documents that exchange updates on `sync`. */
function pair(plugins: { a?: readonly Plugin[]; b?: readonly Plugin[] } = {}) {
  const undo = () => createCollabUndo({ captureTimeout: 0 });
  const a = headlessEditor(readFixture(FILE), { plugins: [...(plugins.a ?? []), undo()] });
  const docB = new Y.Doc();
  Y.applyUpdate(docB, Y.encodeStateAsUpdate(a.doc));
  const b = headlessEditor(readFixture(FILE), {
    doc: docB,
    plugins: [...(plugins.b ?? []), undo()],
  });
  const sync = async () => {
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc, Y.encodeStateVector(b.doc)), 'network');
    Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc, Y.encodeStateVector(a.doc)), 'network');
    await settle();
  };
  return { a, b, sync };
}

const text = (editor: HeadlessEditor) => editor.state.doc.textContent;

describe('shared document undo', () => {
  it('DOCE-COLLAB-6.3 undoes only the writer’s own change, keeping another’s', async () => {
    const { a, b, sync } = pair();
    await sync();
    type(a, 1, ' From A.');
    type(b, 0, ' from B');
    await sync();
    expect(text(a)).toBe('Title from BFirst paragraph. From A.');

    expect(run(a, undoCommand)).toBe(true);
    const tr = a.dispatched.at(-1);
    expect(tr && readCollabChange(tr)?.kind).toBe('undo');
    expect(tr && isRemoteTransaction(tr)).toBe(false);
    await sync();
    expect(text(a)).toBe('Title from BFirst paragraph.');
    expect(text(b)).toBe('Title from BFirst paragraph.');
    expect(sharedDocument(b.doc)?.toJSON()).toEqual(b.state.doc.toJSON());
  });

  it('DOCE-COLLAB-6.3 has nothing to undo after only another writer’s changes', async () => {
    const { a, b, sync } = pair();
    await sync();
    type(b, 1, ' From B.');
    await sync();
    expect(text(a)).toMatch(/From B\./);
    expect(undoCommand(a.state)).toBe(false);
    expect(run(a, undoCommand)).toBe(false);
    expect(text(a)).toMatch(/From B\./);
  });

  it('DOCE-COLLAB-6.3 redoes an undone change', async () => {
    const { a, b, sync } = pair();
    await sync();
    type(a, 1, ' Again.');
    expect(redoCommand(a.state)).toBe(false);
    run(a, undoCommand);
    expect(redoCommand(a.state)).toBe(true);
    run(a, redoCommand);
    await sync();
    expect(text(b)).toMatch(/Again\.$/);
  });

  it('DOCE-COLLAB-6.3 leaves a write a plugin derives from another’s change out of undo', async () => {
    // Marks each heading it receives from another writer, as a plugin that derives writes does.
    const stamp = new Plugin({
      appendTransaction(transactions, _old, state) {
        if (!transactions.some((each) => isRemoteTransaction(each))) return null;
        const tr = state.tr;
        state.doc.descendants((node, pos) => {
          if (node.type.name === 'heading' && node.attrs.className !== 'seen')
            tr.setNodeAttribute(pos, 'className', 'seen');
        });
        return tr.docChanged ? tr : null;
      },
    });
    const { a, b, sync } = pair({ b: [stamp] });
    await sync();
    type(a, 0, ' changed');
    await sync();
    await sync();
    expect(text(b)).toMatch(/Title changed/);
    expect(undoCommand(b.state)).toBe(false);
  });

  it('DOCE-COLLAB-6.3 runs from the editing keys with the editing history off', async () => {
    const editing = createDocumentEditing(documentSchema, { history: false });
    const { a, sync } = pair({ a: editing });
    await sync();
    type(a, 1, ' Keyed.');
    const handled = a.state.plugins.some((plugin) =>
      plugin.props.handleKeyDown?.call(
        plugin,
        a.view,
        new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }),
      ),
    );
    expect(handled).toBe(true);
    expect(text(a)).not.toMatch(/Keyed\./);
  });
});
