import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { type EditorState, NodeSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installEditorDom } from '../../../test/editor-dom.js';
import {
  scriptState,
  type TestScript,
  trackUnhandledRejections,
} from '../../../test/script-blocks.js';
import { listScriptBlocks } from '../../engine/index.js';
import type { ScriptRunnerAdapter } from '../../host/index.js';
import type { TemplateFile } from '../../model/index.js';
import { DocumentEditor, type DocumentEditorProps } from './document-editor.js';
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

type Entry = { id: unknown; isDisabled?: boolean; description?: unknown; onAction?: () => void };
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

  it('DOCE-EDITOR-4.8 DOCE-OBJECTS-4.2 offers no run while the writer suggests, saying why', () => {
    const shown = viewOf([{ id: 'a0000001', source: 'count()' }]);
    const run = vi.fn();
    const entries = scriptEntries(shown, {
      labels,
      openDialog: vi.fn(),
      scriptRunner: { run },
      suggesting: true,
    }) as Entry[];
    expect(entries.map((each) => each.id)).toEqual([
      'edit-script',
      'run-script',
      'run-all-scripts',
    ]);
    for (const each of entries) {
      expect(each).toMatchObject({
        isDisabled: true,
        focusableWhenDisabled: true,
        description: 'Not available while suggesting',
      });
    }
  });
});

const TEMPLATE: TemplateFile = {
  formatVersion: 1,
  id: 'article',
  page: { size: 'A4', margins: { top: '24px', right: '24px', bottom: '24px', left: '24px' } },
};

const OPENING: TestScript = { id: 'a0000001', source: 'count()', refresh: 'open' };

// A runner whose every script produces one paragraph, "Twelve".
const counting = () => ({
  run: vi.fn<ScriptRunnerAdapter['run']>(() =>
    Promise.resolve({
      ok: true,
      value: [{ type: 'paragraph', content: [{ type: 'text', text: 'Twelve' }] }],
    }),
  ),
});

// The editor on a document with a script that runs on opening; the host can open another.
function Harness(props: Partial<DocumentEditorProps>) {
  const [state, setState] = useState<EditorState>(() => scriptState([OPENING]));
  return (
    <>
      <button type="button" onClick={() => setState(scriptState([OPENING]))}>
        Open another
      </button>
      <DocumentEditor
        state={state}
        onStateChange={setState}
        template={TEMPLATE}
        aria-label="Report"
        {...props}
      />
    </>
  );
}

installEditorDom();

describe('the scripts that run on opening', () => {
  const report = () => screen.getByRole('textbox', { name: 'Report' });

  it('DOCE-EDITOR-4.8 DOCE-OBJECTS-4.2 run once for a document, through each switch of layout', async () => {
    const scriptRunner = counting();
    const { rerender } = render(<Harness scriptRunner={scriptRunner} />);
    await waitFor(() => expect(report()).toHaveTextContent('Twelve'));
    expect(scriptRunner.run).toHaveBeenCalledTimes(1);
    const paged = report();
    rerender(<Harness scriptRunner={scriptRunner} layout="web" />);
    await waitFor(() => expect(report()).not.toBe(paged));
    const joined = report();
    rerender(<Harness scriptRunner={scriptRunner} layout="page" />);
    await waitFor(() => expect(report()).not.toBe(joined));
    await waitFor(() => expect(report()).toHaveTextContent('Twelve'));
    expect(scriptRunner.run).toHaveBeenCalledTimes(1);
  });

  it('DOCE-EDITOR-4.8 DOCE-OBJECTS-4.2 run again for another document', async () => {
    const user = userEvent.setup();
    const scriptRunner = counting();
    render(<Harness scriptRunner={scriptRunner} layout="web" />);
    await waitFor(() => expect(report()).toHaveTextContent('Twelve'));
    expect(scriptRunner.run).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Open another' }));
    await waitFor(() => expect(scriptRunner.run).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(report()).toHaveTextContent('Twelve'));
  });

  it.each([
    ['a reader', { editable: false }],
    ['a writer who suggests', { suggesting: true }],
  ])(
    'DOCE-EDITOR-4.8 DOCE-OBJECTS-4.2 do not run for %s, until they edit directly',
    async (_, mode) => {
      const scriptRunner = counting();
      const { rerender } = render(<Harness scriptRunner={scriptRunner} layout="web" {...mode} />);
      await screen.findByRole('textbox', { name: 'Report' });
      expect(scriptRunner.run).not.toHaveBeenCalled();
      expect(report()).not.toHaveTextContent('Twelve');
      rerender(<Harness scriptRunner={scriptRunner} layout="web" />);
      await waitFor(() => expect(report()).toHaveTextContent('Twelve'));
      expect(scriptRunner.run).toHaveBeenCalledTimes(1);
    },
  );
});
