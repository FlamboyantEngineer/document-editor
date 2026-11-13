import { NodeSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  scriptState,
  type TestScript,
  trackUnhandledRejections,
} from '../../../test/script-blocks.js';
import { listScriptBlocks } from '../../engine/index.js';
import type { ScriptRunnerAdapter } from '../../host/index.js';
import { DEFAULT_EDITOR_LABELS as labels } from './editor-labels.js';
import { scriptEntries } from './script-entries.js';

let view: EditorView | null = null;
afterEach(() => view?.destroy());

// A view of a document with the scripts given, the first script block selected.
function viewOf(scripts: readonly TestScript[]) {
  const state = scriptState(scripts);
  const at = listScriptBlocks(state.doc)[0]?.pos ?? 0;
  view = new EditorView(document.createElement('div'), {
    state: state.apply(state.tr.setSelection(NodeSelection.create(state.doc, at))),
  });
  return view;
}

type Entry = { id: unknown; onAction?: () => void };
const press = (entries: readonly unknown[], id: string) =>
  (entries as Entry[]).find((each) => each.id === id)?.onAction?.();

describe('scriptEntries', () => {
  it('DOCE-EDITOR-4.8 runs the script block selected, or every script', async () => {
    const shown = viewOf([
      { id: 'a0000001', source: 'first()' },
      { id: 'a0000002', source: 'second()' },
    ]);
    const run = vi.fn<ScriptRunnerAdapter['run']>(() => Promise.resolve({ ok: true, value: [] }));
    const entries = scriptEntries(shown, { labels, openDialog: null, scriptRunner: { run } });
    press(entries, 'run-script');
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run.mock.calls[0]?.[0]).toMatchObject({ blockId: 'a0000001', source: 'first()' });
    press(entries, 'run-all-scripts');
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(3));
    expect(run.mock.calls[2]?.[0]).toMatchObject({ blockId: 'a0000002', source: 'second()' });
  });

  it('DOCE-EDITOR-4.8 leaves the document as it is when the run of a script fails', async () => {
    const shown = viewOf([{ id: 'a0000001', source: 'count()' }]);
    const before = shown.state.doc;
    const run = vi.fn(() => {
      throw new Error('offline');
    });
    const rejections = trackUnhandledRejections();
    press(scriptEntries(shown, { labels, openDialog: null, scriptRunner: { run } }), 'run-script');
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    await rejections.settled();
    rejections.stop();
    expect(rejections.unhandled).not.toHaveBeenCalled();
    expect(shown.state.doc.eq(before)).toBe(true);
  });
});
