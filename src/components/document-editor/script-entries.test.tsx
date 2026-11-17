import { render, screen, waitFor, within } from '@testing-library/react';
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
    const run = vi.fn<ScriptRunnerAdapter['run']>(() =>
      Promise.resolve({ ok: true, value: { content: [] } }),
    );
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
      value: { content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Twelve' }] }] },
    }),
  ),
});

// The editor on a document with a script that runs on opening; the host can open another.
function Harness({
  scripts = [OPENING],
  ...props
}: Partial<DocumentEditorProps> & { scripts?: readonly TestScript[] }) {
  const [state, setState] = useState<EditorState>(() => scriptState(scripts));
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

describe('a document as it opens', () => {
  const report = () => screen.getByRole('textbox', { name: 'Report' });
  // A runner that records the inputs key `k1`, for which every output is current but `old`.
  const keyed = () => ({
    run: vi.fn<ScriptRunnerAdapter['run']>(() =>
      Promise.resolve({ ok: true, value: { content: [] } }),
    ),
    inputsKey: vi.fn<NonNullable<ScriptRunnerAdapter['inputsKey']>>(() =>
      Promise.resolve({ ok: true, value: 'k1' }),
    ),
  });

  it('DOCE-EDITOR-4.8 DOCE-OBJECTS-4.2 runs no script, its stored policy of running on opening aside, through each switch of layout', async () => {
    const scriptRunner = counting();
    const { rerender } = render(<Harness scriptRunner={scriptRunner} />);
    const paged = await screen.findByRole('textbox', { name: 'Report' });
    rerender(<Harness scriptRunner={scriptRunner} layout="web" />);
    await waitFor(() => expect(report()).not.toBe(paged));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(scriptRunner.run).not.toHaveBeenCalled();
    expect(report()).not.toHaveTextContent('Twelve');
  });

  it('DOCE-EDITOR-4.8 DOCE-OBJECTS-4.7 checks the outputs once for each document, with the template it pins', async () => {
    const user = userEvent.setup();
    const scriptRunner = keyed();
    const pin = { id: 'article', revision: 'r2' };
    const { rerender } = render(
      <Harness scriptRunner={scriptRunner} templatePin={pin} layout="web" />,
    );
    await waitFor(() => expect(scriptRunner.inputsKey).toHaveBeenCalledTimes(1));
    expect(scriptRunner.inputsKey.mock.calls[0]?.[0].document.template).toEqual(pin);
    rerender(<Harness scriptRunner={scriptRunner} templatePin={pin} layout="page" />);
    await screen.findByRole('textbox', { name: 'Report' });
    await user.click(screen.getByRole('button', { name: 'Open another' }));
    await waitFor(() => expect(scriptRunner.inputsKey).toHaveBeenCalledTimes(2));
    expect(scriptRunner.run).not.toHaveBeenCalled();
  });

  it.each([
    ['a reader', { editable: false }],
    ['a writer who suggests', { suggesting: true }],
  ])(
    'DOCE-EDITOR-4.8 DOCE-OBJECTS-4.7 checks nothing for %s, until they edit directly',
    async (_, mode) => {
      const scriptRunner = keyed();
      const { rerender } = render(<Harness scriptRunner={scriptRunner} layout="web" {...mode} />);
      await screen.findByRole('textbox', { name: 'Report' });
      expect(scriptRunner.inputsKey).not.toHaveBeenCalled();
      rerender(<Harness scriptRunner={scriptRunner} layout="web" />);
      await waitFor(() => expect(scriptRunner.inputsKey).toHaveBeenCalledTimes(1));
    },
  );

  it('DOCE-OBJECTS-4.7 marks the outputs whose inputs changed stale', async () => {
    const scriptRunner = keyed();
    const old: TestScript = { id: 'a0000002', source: 'other()' };
    render(<Harness scripts={[OPENING, old]} scriptRunner={scriptRunner} layout="web" />);
    await waitFor(() =>
      expect(document.querySelectorAll('[data-script-state="stale"]')).toHaveLength(2),
    );
    expect(scriptRunner.run).not.toHaveBeenCalled();
  });
});

describe('a run of the scripts in the editor', () => {
  it('DOCE-EDITOR-4.8 DOCE-OBJECTS-4.2 waits while another run is in flight, saying why', async () => {
    let release: () => void = () => undefined;
    const run = vi.fn<ScriptRunnerAdapter['run']>(async () => {
      await new Promise<void>((resolve) => (release = resolve));
      return { ok: true, value: { content: [] } };
    });
    const shown = viewOf([{ id: 'a0000001', source: 'count()' }]);
    press(
      scriptEntries(shown, { labels, openDialog: vi.fn(), scriptRunner: { run } }),
      'run-script',
    );
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    const waiting = scriptEntries(shown, { labels, openDialog: vi.fn(), scriptRunner: { run } });
    expect((waiting as Entry[]).map((each) => [each.id, each.isDisabled ?? false])).toEqual([
      ['edit-script', false],
      ['run-script', true],
      ['run-all-scripts', true],
    ]);
    expect((waiting as Entry[])[1]?.description).toBe(labels.reasonScriptsRunning);
    release();
    await vi.waitFor(() =>
      expect(
        (
          scriptEntries(shown, { labels, openDialog: null, scriptRunner: { run } }) as Entry[]
        ).every((each) => !each.isDisabled),
      ).toBe(true),
    );
  });

  it('DOCE-EDITOR-4.8 DOCE-EDITOR-7.7 DOCE-OBJECTS-4.3 shows a running banner, then the failure, and a message in each block', async () => {
    const user = userEvent.setup();
    let release: () => void = () => undefined;
    const run = vi.fn<ScriptRunnerAdapter['run']>(async ({ source }) => {
      await new Promise<void>((resolve) => (release = resolve));
      return source === 'fail()'
        ? { ok: false, error: { kind: 'unavailable', message: 'count is not defined' } }
        : { ok: true, value: { content: [] } };
    });
    render(
      <Harness
        scripts={[
          { id: 'a0000001', source: 'fail()', output: 'Shown before' },
          { id: 'a0000002', source: 'none()' },
          { id: 'a0000003', source: 'none()' },
        ]}
        scriptRunner={{ run }}
        layout="web"
      />,
    );
    const report = await screen.findByRole('textbox', { name: 'Report' });
    // A block whose script produced nothing says so, while the document is edited.
    await waitFor(() =>
      expect(report.querySelectorAll('[data-script-message="empty"]')).toHaveLength(2),
    );
    expect(report.querySelector('[data-script-message="empty"]')).toHaveTextContent(
      labels.scriptEmpty,
    );
    await user.click(screen.getByText('Shown before'));
    await user.pointer({ keys: '[MouseRight]', target: screen.getByText('Shown before') });
    const menu = await screen.findByRole('menu');
    await user.click(within(menu).getByRole('menuitem', { name: labels.runAllScripts }));
    const busy = await screen.findByText(labels.scriptsRunning);
    expect(busy.closest('[data-banner="scripts-running"]')).toHaveAttribute('aria-busy', 'true');
    for (const count of [2, 3]) {
      release();
      await waitFor(() => expect(run).toHaveBeenCalledTimes(count));
    }
    release();
    const failed = await screen.findByText(labels.scriptFailed('count is not defined', 1));
    expect(failed.closest('[data-banner]')).toHaveAttribute('data-banner', 'script-error');
    expect(screen.queryByText(labels.scriptsRunning)).not.toBeInTheDocument();
    // The failed block shows the runner's message as it gave it, keeping its output.
    expect(report.querySelector('[data-script-message="error"]')).toHaveTextContent(
      'count is not defined',
    );
    expect(report).toHaveTextContent('Shown before');
    await user.click(within(failed.closest('[data-banner]') as HTMLElement).getByRole('button'));
    expect(
      screen.queryByText(labels.scriptFailed('count is not defined', 1)),
    ).not.toBeInTheDocument();
  });

  it('DOCE-EDITOR-4.8 lets the host replace the script entries’ and banners’ text', async () => {
    const shown = viewOf([{ id: 'a0000001', source: 'count()' }]);
    const replaced = {
      ...labels,
      editScript: 'Edit...',
      runAllScripts: 'Run all scripts in document',
    };
    const entries = scriptEntries(shown, {
      labels: replaced,
      openDialog: vi.fn(),
      scriptRunner: counting(),
    }) as (Entry & { label?: unknown })[];
    expect(entries.map((each) => each.label)).toEqual([
      'Edit...',
      labels.runScript,
      'Run all scripts in document',
    ]);
  });
});
