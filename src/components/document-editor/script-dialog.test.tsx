import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { NodeSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installEditorDom } from '../../../test/editor-dom.js';
import { scriptState } from '../../../test/script-blocks.js';
import { listScriptBlocks, markRemote } from '../../engine/index.js';
import type { ScriptRunnerAdapter } from '../../host/index.js';
import type { TemplateFile } from '../../model/index.js';
import { DEFAULT_EDITOR_LABELS as labels } from './editor-labels.js';
import { ScriptDialog } from './script-dialog.js';

const TEMPLATE: TemplateFile = { formatVersion: 1, id: 'article' };

let view: EditorView | null = null;
afterEach(() => view?.destroy());

// The script dialog open on the script block of a document: a paragraph, then the block.
function openDialog(runner: ScriptRunnerAdapter) {
  const state = scriptState([{ id: 'a0000001', source: 'old()' }]);
  const at = listScriptBlocks(state.doc)[0]?.pos ?? 0;
  const shown = new EditorView(document.body.appendChild(document.createElement('div')), {
    state: state.apply(state.tr.setSelection(NodeSelection.create(state.doc, at))),
  });
  view = shown;
  const onClose = vi.fn();
  render(
    <ScriptDialog
      view={shown}
      labels={labels}
      onClose={onClose}
      runner={runner}
      template={TEMPLATE}
    />,
  );
  return { shown, onClose };
}

const runner = () => ({
  run: vi.fn<ScriptRunnerAdapter['run']>(() =>
    Promise.resolve({ ok: true, value: { content: [] } }),
  ),
});

const scriptOf = (shown: EditorView) =>
  listScriptBlocks(shown.state.doc).map((block) => String(block.node.attrs.script));

// Another writer's change: the paragraph before the script block is deleted, or the block itself.
function deleteRemotely(shown: EditorView, what: 'paragraph' | 'script') {
  const block = listScriptBlocks(shown.state.doc)[0];
  if (!block) throw new Error('The document has a script block.');
  const [from, to] =
    what === 'script' ? [block.pos, block.pos + block.node.nodeSize] : [block.pos - 8, block.pos];
  act(() => shown.dispatch(markRemote(shown.state.tr.delete(from, to))));
}

async function writeScript(user: ReturnType<typeof userEvent.setup>, script: string) {
  const source = screen.getByRole('textbox', { name: 'Script' });
  await user.clear(source);
  await user.type(source, script);
}

installEditorDom();

describe('ScriptDialog', () => {
  it('DOCE-EDITOR-4.8 sets the script of the block it edits where the block is now, and runs it', async () => {
    const user = userEvent.setup();
    const host = runner();
    const { shown, onClose } = openDialog(host);
    await writeScript(user, 'fresh()');
    deleteRemotely(shown, 'paragraph');
    await user.click(screen.getByRole('button', { name: 'Apply and run' }));
    expect(scriptOf(shown)).toEqual(['fresh()']);
    await waitFor(() => expect(host.run).toHaveBeenCalledTimes(1));
    expect(host.run.mock.calls[0]?.[0]).toMatchObject({ blockId: 'a0000001', source: 'fresh()' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('DOCE-EDITOR-4.8 stays open with the script and says so when the block it edits is gone', async () => {
    const user = userEvent.setup();
    const host = runner();
    const { shown, onClose } = openDialog(host);
    await writeScript(user, 'fresh()');
    deleteRemotely(shown, 'script');
    const before = shown.state.doc;
    await user.click(screen.getByRole('button', { name: 'Apply and run' }));
    expect(await screen.findByText('The script block is no longer in the document.')).toHaveRole(
      'alert',
    );
    expect(screen.getByRole('textbox', { name: 'Script' })).toHaveValue('fresh()');
    expect(onClose).not.toHaveBeenCalled();
    expect(host.run).not.toHaveBeenCalled();
    expect(shown.state.doc).toBe(before);
  });

  it("DOCE-EDITOR-4.9 keeps Apply and run disabled until the host's check of the script answers", async () => {
    const user = userEvent.setup();
    let answer: (diagnostics: []) => void = () => undefined;
    const host = {
      ...runner(),
      check: vi.fn<NonNullable<ScriptRunnerAdapter['check']>>(
        () =>
          new Promise((resolve) => {
            answer = (value) => resolve({ ok: true, value });
          }),
      ),
    };
    openDialog(host);
    await writeScript(user, 'fresh()');
    const apply = screen.getByRole('button', { name: 'Apply and run' });
    expect(apply).toBeDisabled();
    await waitFor(() => expect(host.check).toHaveBeenCalled());
    expect(apply).toBeDisabled();
    act(() => answer([]));
    await waitFor(() => expect(apply).toBeEnabled());
  });

  it('DOCE-EDITOR-4.9 lets a script be applied when the check fails', async () => {
    const user = userEvent.setup();
    const host = {
      ...runner(),
      check: vi.fn<NonNullable<ScriptRunnerAdapter['check']>>(() =>
        Promise.reject(new Error('offline')),
      ),
    };
    openDialog(host);
    await writeScript(user, 'fresh()');
    await waitFor(() => expect(host.check).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Apply and run' })).toBeEnabled(),
    );
  });

  it('DOCE-EDITOR-4.9 wraps the long lines of the script until the writer switches it off', async () => {
    const user = userEvent.setup();
    openDialog(runner());
    const source = screen.getByRole('textbox', { name: 'Script' });
    expect(source).toHaveAttribute('wrap', 'soft');
    await user.click(screen.getByRole('switch', { name: 'Wrap lines' }));
    expect(source).toHaveAttribute('wrap', 'off');
  });

  it('DOCE-EDITOR-4.9 keeps the preview while the reference is shown', async () => {
    const user = userEvent.setup();
    const host = {
      run: vi.fn<ScriptRunnerAdapter['run']>(() =>
        Promise.resolve({
          ok: true,
          value: { content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Twelve' }] }] },
        }),
      ),
    };
    openDialog(host);
    await user.click(screen.getByRole('button', { name: 'Refresh preview' }));
    const shown = await screen.findByRole('textbox', { name: 'Preview' });
    await user.click(screen.getByRole('tab', { name: 'Reference' }));
    await user.click(screen.getByRole('tab', { name: 'Preview' }));
    expect(screen.getByRole('textbox', { name: 'Preview' })).toBe(shown);
    expect(host.run).toHaveBeenCalledTimes(1);
  });

  it('DOCE-EDITOR-4.9 stops the preview run asked when the script changes', async () => {
    const user = userEvent.setup();
    const signals: AbortSignal[] = [];
    const host = {
      run: vi.fn<ScriptRunnerAdapter['run']>((_request, signal) => {
        if (signal) signals.push(signal);
        return new Promise(() => undefined);
      }),
    };
    openDialog(host);
    await user.click(screen.getByRole('button', { name: 'Refresh preview' }));
    expect(signals[0]?.aborted).toBe(false);
    await user.type(screen.getByRole('textbox', { name: 'Script' }), ';');
    expect(signals[0]?.aborted).toBe(true);
    expect(document.querySelector('.de-script-editor__preview')).toHaveAttribute(
      'data-status',
      'idle',
    );
  });

  it('DOCE-EDITOR-4.9 keeps the preview from running while the check finds an error', async () => {
    const user = userEvent.setup();
    const host = {
      ...runner(),
      check: vi.fn<NonNullable<ScriptRunnerAdapter['check']>>(() =>
        Promise.resolve({ ok: true, value: [{ message: 'Unexpected end', line: 1, column: 6 }] }),
      ),
    };
    openDialog(host);
    await writeScript(user, 'fresh(');
    const refresh = screen.getByRole('button', { name: 'Refresh preview' });
    await waitFor(() => expect(refresh).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Apply and run' })).toBeDisabled();
    expect(host.run).not.toHaveBeenCalled();
  });

  it("DOCE-HOST-1.11 tells the host's check which block the script is for, in the document as it is", async () => {
    const user = userEvent.setup();
    const host = {
      ...runner(),
      check: vi.fn<NonNullable<ScriptRunnerAdapter['check']>>(() =>
        Promise.resolve({ ok: true, value: [] }),
      ),
    };
    openDialog(host);
    await writeScript(user, 'fresh()');
    await waitFor(() => expect(host.check).toHaveBeenCalled());
    const [source, signal, context] = host.check.mock.calls.at(-1) ?? [];
    expect(source).toBe('fresh()');
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(context?.blockId).toBe('a0000001');
    expect(context?.document.sections[0]?.content?.[1]).toMatchObject({
      type: 'script',
      attrs: { id: 'a0000001' },
    });
  });

  it("DOCE-HOST-1.11 offers only the host's names when they are every name a script can use", async () => {
    const user = userEvent.setup();
    const vocabulary = [{ name: 'render', kind: 'object' as const, description: 'Builds output.' }];
    openDialog({ ...runner(), vocabulary, standardVocabulary: false });
    await user.click(screen.getByRole('tab', { name: 'Reference' }));
    const reference = document.querySelector('.de-script-editor__reference');
    expect(reference).toHaveTextContent('render');
    expect(reference).not.toHaveTextContent('Math');
    expect(reference).not.toHaveTextContent('const');
  });

  it("DOCE-HOST-1.11 offers the standard names after the host's by default", async () => {
    const user = userEvent.setup();
    const vocabulary = [{ name: 'render', kind: 'object' as const, description: 'Builds output.' }];
    openDialog({ ...runner(), vocabulary });
    await user.click(screen.getByRole('tab', { name: 'Reference' }));
    const reference = document.querySelector('.de-script-editor__reference');
    expect(reference).toHaveTextContent('render');
    expect(reference).toHaveTextContent('Math');
  });
});
