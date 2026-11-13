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
});
