import { undo } from 'prosemirror-history';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, writeDocumentFile } from '../model/index.js';
import { createDocumentEditing } from './document-editing.js';
import {
  insertScriptBlock,
  listScriptBlocks,
  runScripts,
  scriptsState,
  setScriptSource,
} from './scripts.js';

const runner = {
  run: ({ source }: { source: string }) =>
    Promise.resolve(
      source === 'fail'
        ? { ok: false as const, error: { kind: 'unavailable' as const, message: 'Broken' } }
        : {
            ok: true as const,
            value: [{ type: 'paragraph', content: [{ type: 'text', text: `Ran ${source}` }] }],
          },
    ),
};

function viewWith(scriptText: string) {
  const doc = readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Intro' }] },
            { type: 'script', attrs: { id: 'a0000001', source: scriptText } },
          ],
        },
      ],
    },
    documentSchema,
  );
  return new EditorView(document.createElement('div'), {
    state: EditorState.create({
      doc,
      plugins: createDocumentEditing(documentSchema),
    }),
  });
}

const outputText = (view: EditorView) =>
  listScriptBlocks(view.state.doc)[0]?.node.textContent ?? null;

describe('script blocks', () => {
  it('DOCE-OBJECTS-4.1 inserts a script block and sets its script, stored with it', () => {
    const view = viewWith('one');
    const intro = view.state.doc.resolve(3);
    view.dispatch(view.state.tr.setSelection(TextSelection.near(intro)));
    expect(insertScriptBlock('two')(view.state, view.dispatch)).toBe(true);
    const added = listScriptBlocks(view.state.doc).find(
      (block) => block.node.attrs.script === 'two',
    );
    view.dispatch(
      view.state.tr.setSelection(NodeSelection.create(view.state.doc, added?.pos ?? 0)),
    );
    expect(setScriptSource('three')(view.state, view.dispatch)).toBe(true);
    const stored = writeDocumentFile(view.state.doc).sections[0]?.content ?? [];
    expect(
      stored.filter((node) => node.type === 'script').map((node) => node.attrs?.source),
    ).toEqual(['three', 'one']);
    view.destroy();
  });

  it('DOCE-OBJECTS-4.2 runs the scripts into their outputs as one change, and records failures', async () => {
    const view = viewWith('one');
    const failed = await runScripts(view, runner, { now: () => new Date('2026-03-01T00:00:00Z') });
    expect(failed).toEqual([]);
    expect(outputText(view)).toBe('Ran one');
    expect(listScriptBlocks(view.state.doc)[0]?.node.attrs.renderedAt).toBe(
      '2026-03-01T00:00:00.000Z',
    );
    undo(view.state, view.dispatch);
    expect(outputText(view)).toBe('');
    setScriptSource('fail')(
      view.state.apply(
        view.state.tr.setSelection(
          NodeSelection.create(view.state.doc, listScriptBlocks(view.state.doc)[0]?.pos ?? 0),
        ),
      ),
      view.dispatch,
    );
    expect(await runScripts(view, runner)).toEqual(['a0000001']);
    expect(scriptsState(view.state).failed.get('a0000001')).toBe('Broken');
    view.destroy();
  });

  it('DOCE-OBJECTS-4.2 gives an output the same element ids on every run, and leaves an identical rerun alone', async () => {
    const first = viewWith('one');
    const second = viewWith('one');
    await runScripts(first, runner);
    await runScripts(second, runner);
    const idOf = (view: EditorView) =>
      listScriptBlocks(view.state.doc)[0]?.node.firstChild?.attrs.dataId as unknown;
    expect(idOf(first)).toMatch(/^[0-9a-f]{8}$/);
    expect(idOf(second)).toBe(idOf(first));
    const before = first.state.doc;
    await runScripts(first, runner, { now: () => new Date('2027-01-01T00:00:00Z') });
    expect(first.state.doc).toBe(before);
    first.destroy();
    second.destroy();
  });

  it('DOCE-OBJECTS-4.2 compares an output without its element ids, but with its other attributes', async () => {
    let level = 1;
    const headings = {
      run: () =>
        Promise.resolve({
          ok: true as const,
          value: [
            {
              type: 'heading',
              attrs: { level, id: 'ffffffff' },
              content: [{ type: 'text', text: 'Results' }],
            },
          ],
        }),
    };
    const view = viewWith('one');
    await runScripts(view, headings);
    const before = view.state.doc;
    // Another id from the script is identity, not content.
    await runScripts(view, headings);
    expect(view.state.doc).toBe(before);
    level = 2;
    await runScripts(view, headings);
    expect(listScriptBlocks(view.state.doc)[0]?.node.firstChild?.attrs.level).toBe(2);
    view.destroy();
  });

  it('DOCE-OBJECTS-4.3 refuses the writer editing an output, but not deleting the block', async () => {
    const view = viewWith('one');
    await runScripts(view, runner);
    const block = listScriptBlocks(view.state.doc)[0];
    if (!block) throw new Error('The document has a script block');
    // The editing plugins give the output's elements ids.
    expect(block.node.firstChild?.attrs.dataId).toMatch(/^[0-9a-f]{8}$/);
    view.dispatch(view.state.tr.insertText('x', block.pos + 3));
    expect(outputText(view)).toBe('Ran one');
    view.dispatch(view.state.tr.delete(block.pos, block.pos + block.node.nodeSize));
    expect(listScriptBlocks(view.state.doc)).toHaveLength(0);
    view.destroy();
  });
});
