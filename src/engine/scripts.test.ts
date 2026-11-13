import { undo } from 'prosemirror-history';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import type { ScriptRunRequest } from '../host/index.js';
import { readDocumentFile, type StoredContent, writeDocumentFile } from '../model/index.js';
import { createDocumentEditing } from './document-editing.js';
import { listScriptBlocks } from './script-output.js';
import { insertScriptBlock, runScripts, scriptsState, setScriptSource } from './scripts.js';

const runner = {
  run: ({ source }: { source: string }) =>
    Promise.resolve(
      source === 'fail'
        ? { ok: false as const, error: { kind: 'unavailable' as const, message: 'Broken' } }
        : {
            ok: true as const,
            value: {
              content: [{ type: 'paragraph', content: [{ type: 'text', text: `Ran ${source}` }] }],
            },
          },
    ),
};

// A document of an introduction and a script block for each script, with ids counted from 1.
function viewWith(...scripts: string[]) {
  const blocks = scripts.map((source, index) => ({
    type: 'script',
    attrs: { id: `a000000${String(index + 1)}`, source },
  }));
  const doc = readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Intro' }] }, ...blocks],
        },
      ],
    },
    documentSchema,
  ).doc;
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

  it('DOCE-OBJECTS-4.2 records an output it cannot read as a failure, and keeps the other outputs', async () => {
    const unread: StoredContent = [{ type: 'no-such-node' }];
    const odd = {
      run: ({ source }: { source: string }) =>
        source === 'unread'
          ? Promise.resolve({ ok: true as const, value: { content: unread } })
          : runner.run({ source }),
    };
    const view = viewWith('one', 'unread', 'two');
    expect(await runScripts(view, odd)).toEqual(['a0000002']);
    const { running, failed } = scriptsState(view.state);
    expect([...running]).toEqual([]);
    expect(failed.get('a0000002')).toContain('no-such-node');
    expect(listScriptBlocks(view.state.doc).map((block) => block.node.textContent)).toEqual([
      'Ran one',
      '',
      'Ran two',
    ]);
    expect(view.dom.querySelectorAll('[data-script-state="error"]')).toHaveLength(1);
    expect(view.dom.querySelectorAll('[data-script-state="running"]')).toHaveLength(0);
    view.destroy();
  });

  it('DOCE-OBJECTS-4.2 records a runner that throws as a failure and ends the run', async () => {
    const broken = {
      run: ({ source }: { source: string }) => {
        if (source === 'throws') throw new Error('No runner');
        return runner.run({ source });
      },
    };
    const view = viewWith('throws', 'one');
    expect(await runScripts(view, broken)).toEqual(['a0000001']);
    expect(scriptsState(view.state).failed.get('a0000001')).toBe('No runner');
    expect([...scriptsState(view.state).running]).toEqual([]);
    expect(listScriptBlocks(view.state.doc)[1]?.node.textContent).toBe('Ran one');
    view.destroy();
  });

  it('DOCE-OBJECTS-4.2 keeps another run’s blocks running, and its failures, until that run ends', async () => {
    let release: () => void = () => undefined;
    const slow = {
      run: async ({ source }: { source: string }) => {
        if (source === 'slow') await new Promise<void>((resolve) => (release = resolve));
        return runner.run({ source });
      },
    };
    const view = viewWith('slow', 'fail');
    const first = runScripts(view, slow, { ids: ['a0000001'] });
    expect(await runScripts(view, slow, { ids: ['a0000002'] })).toEqual(['a0000002']);
    expect([...scriptsState(view.state).running]).toEqual(['a0000001']);
    release();
    expect(await first).toEqual([]);
    const { running, failed } = scriptsState(view.state);
    expect([...running]).toEqual([]);
    expect([...failed.keys()]).toEqual(['a0000002']);
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
          value: {
            content: [
              {
                type: 'heading',
                attrs: { level, id: 'ffffffff' },
                content: [{ type: 'text', text: 'Results' }],
              },
            ],
          },
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

  it('DOCE-OBJECTS-4.3 refuses the writer changing an attribute inside an output', async () => {
    const view = viewWith('one');
    await runScripts(view, {
      run: () =>
        Promise.resolve({
          ok: true as const,
          value: {
            content: [
              {
                type: 'heading',
                attrs: { level: 1 },
                content: [{ type: 'text', text: 'Results' }],
              },
            ],
          },
        }),
    });
    const levelOf = () =>
      listScriptBlocks(view.state.doc)[0]?.node.firstChild?.attrs.level as unknown;
    const at = (listScriptBlocks(view.state.doc)[0]?.pos ?? 0) + 1;
    view.dispatch(view.state.tr.setNodeAttribute(at, 'level', 3));
    expect(levelOf()).toBe(1);
    // The ids the editing plugins give an output's elements are not the writer's change.
    view.dispatch(view.state.tr.setNodeAttribute(at, 'dataId', '0000beef'));
    expect(listScriptBlocks(view.state.doc)[0]?.node.firstChild?.attrs.dataId).toBe('0000beef');
    view.destroy();
  });

  it('DOCE-OBJECTS-4.6 tells the runner why it runs, and records where an output came from', async () => {
    const purposes: string[] = [];
    const signals: (AbortSignal | undefined)[] = [];
    const recording = {
      run: ({ purpose, source }: ScriptRunRequest, signal?: AbortSignal) => {
        purposes.push(purpose);
        signals.push(signal);
        return Promise.resolve({
          ok: true as const,
          value: {
            content: [{ type: 'paragraph', content: [{ type: 'text', text: source }] }],
            provenance: { source: 'lab', inputs: `key-${source}` },
            signatures: [{ person: 'p1' }],
          },
        });
      },
    };
    const view = viewWith('one');
    const controller = new AbortController();
    await runScripts(view, recording, { signal: controller.signal });
    await runScripts(view, recording, { purpose: 'open' });
    expect(purposes).toEqual(['run', 'open']);
    expect(signals).toEqual([controller.signal, undefined]);
    const block = listScriptBlocks(view.state.doc)[0]?.node;
    expect(block?.attrs.provenance).toEqual({ source: 'lab', inputs: 'key-one' });
    expect(block?.attrs.signatures).toEqual([{ person: 'p1' }]);
    // The same content and records again leave the document as it is.
    const before = view.state.doc;
    await runScripts(view, recording);
    expect(view.state.doc).toBe(before);
    view.destroy();
  });

  it('DOCE-OBJECTS-4.6 stops when the signal aborts, putting nothing in', async () => {
    const controller = new AbortController();
    const reason = new Error('Stopped');
    let calls = 0;
    const stopping = {
      run: ({ source }: ScriptRunRequest) => {
        calls += 1;
        controller.abort(reason);
        return runner.run({ source });
      },
    };
    const view = viewWith('one', 'two');
    await expect(runScripts(view, stopping, { signal: controller.signal })).rejects.toBe(reason);
    expect(calls).toBe(1);
    expect(outputText(view)).toBe('');
    expect([...scriptsState(view.state).running]).toEqual([]);
    view.destroy();
  });
});
