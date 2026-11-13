import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import type { ScriptRunnerAdapter } from '../host/index.js';
import { readDocumentFile, writeDocumentFile } from '../model/index.js';
import { createDocumentEditing } from './document-editing.js';
import { listScriptBlocks } from './script-output.js';
import { findStaleScripts } from './script-staleness.js';
import { checkStaleScripts, createScripts, runScripts, scriptsState } from './scripts.js';

// Blocks whose outputs recorded the inputs given, null for none; the first `opening` run on opening.
function docWith(recorded: readonly (string | null)[], opening = 0) {
  return readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: recorded.map((inputs, index) => ({
            type: 'script',
            attrs: {
              id: `a000000${String(index + 1)}`,
              source: `s${String(index + 1)}`,
              ...(inputs ? { provenance: { inputs } } : {}),
              ...(index < opening ? { refresh: 'open' } : {}),
            },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Out' }] }],
          })),
        },
      ],
    },
    documentSchema,
  ).doc;
}

// A runner whose inputs key for each script is the one the map gives, failing for a missing one,
// and whose outputs record that key.
function keyedRunner(keys: Record<string, string>): ScriptRunnerAdapter {
  return {
    inputsKey: ({ source }) =>
      Promise.resolve(
        keys[source] === undefined
          ? { ok: false, error: { kind: 'unavailable' } }
          : { ok: true, value: keys[source] },
      ),
    run: ({ source }) =>
      Promise.resolve({
        ok: true,
        value: {
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Out' }] }],
          provenance: { inputs: keys[source] ?? null },
        },
      }),
  };
}

const stateOf = (view: EditorView) =>
  [...view.dom.querySelectorAll('[data-script-state]')].map((block) =>
    block.getAttribute('data-script-state'),
  );

describe('stale script output', () => {
  it('DOCE-OBJECTS-4.7 finds the outputs whose inputs key changed or was never recorded', async () => {
    const doc = docWith(['k1', 'old', null, 'k4']);
    const runner = keyedRunner({ s1: 'k1', s2: 'k2', s3: 'k3' });
    const document = writeDocumentFile(doc);
    await expect(findStaleScripts(doc, runner, { document })).resolves.toEqual([
      'a0000002',
      'a0000003',
    ]);
    await expect(findStaleScripts(doc, runner, { document, ids: ['a0000003'] })).resolves.toEqual([
      'a0000003',
    ]);
    const { run } = runner;
    await expect(findStaleScripts(doc, { run }, { document })).resolves.toEqual([]);
    const controller = new AbortController();
    controller.abort(new Error('Stopped'));
    await expect(
      findStaleScripts(doc, runner, { document, signal: controller.signal }),
    ).rejects.toThrow('Stopped');
  });

  it('DOCE-OBJECTS-4.7 marks stale blocks until they run again', async () => {
    const runner = keyedRunner({ s1: 'k1', s2: 'k2' });
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({
        doc: docWith(['k1', 'old']),
        plugins: createDocumentEditing(documentSchema),
      }),
    });
    await expect(checkStaleScripts(view, runner)).resolves.toEqual(['a0000002']);
    expect([...scriptsState(view.state).stale]).toEqual(['a0000002']);
    expect(stateOf(view)).toEqual(['stale']);
    await runScripts(view, runner, { ids: ['a0000002'] });
    expect([...scriptsState(view.state).stale]).toEqual([]);
    expect(listScriptBlocks(view.state.doc)[1]?.node.attrs.provenance).toEqual({ inputs: 'k2' });
    view.destroy();
  });

  it('DOCE-OBJECTS-4.7 checks staleness after the opening scripts ran', async () => {
    const runner = keyedRunner({ s1: 'k1', s2: 'k2' });
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({
        doc: docWith(['old', 'old'], 1),
        plugins: [createScripts({ runner })],
      }),
    });
    // The opening script recorded its inputs as it ran, so only the other is stale.
    await expect.poll(() => [...scriptsState(view.state).stale]).toEqual(['a0000002']);
    expect(listScriptBlocks(view.state.doc)[0]?.node.attrs.provenance).toEqual({ inputs: 'k1' });
    view.destroy();
  });
});
