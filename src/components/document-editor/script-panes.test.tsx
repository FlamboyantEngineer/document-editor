import { render, screen } from '@testing-library/react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import type { ScriptRunnerAdapter } from '../../host/index.js';
import { readDocumentFile, type StoredContent, type TemplateFile } from '../../model/index.js';
import { DEFAULT_EDITOR_LABELS as labels } from './editor-labels.js';
import { previewScript, ScriptPreview } from './script-panes.js';

const TEMPLATE: TemplateFile = { formatVersion: 1, id: 'article' };

function editorView() {
  const doc = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content: [{ type: 'paragraph' }] }] },
    documentSchema,
  ).doc;
  return new EditorView(document.createElement('div'), { state: EditorState.create({ doc }) });
}

// A runner whose every script produces the content given.
const producing = (value: StoredContent): ScriptRunnerAdapter => ({
  run: vi.fn(() => Promise.resolve({ ok: true as const, value })),
});

// What the preview says in place of an output; the document it shows has live regions of its own.
const status = () => document.querySelector('.de-script-editor__status');

installEditorDom();

describe('previewScript', () => {
  it('DOCE-EDITOR-4.9 shows what the script produced, the document left as it is', async () => {
    const view = editorView();
    const before = view.state;
    const runner = producing([{ type: 'paragraph', content: [{ type: 'text', text: 'Twelve' }] }]);
    const preview = await previewScript(view, runner, { source: 'count()', labels });
    render(
      <ScriptPreview
        template={TEMPLATE}
        labels={labels}
        preview={preview}
        onRefresh={() => undefined}
      />,
    );
    expect(screen.getByRole('textbox', { name: 'Preview' })).toHaveTextContent('Twelve');
    expect(status()).toBeNull();
    expect(view.state).toBe(before);
    view.destroy();
  });

  it('DOCE-EDITOR-4.9 says the script produced nothing', async () => {
    const view = editorView();
    const preview = await previewScript(view, producing([]), { source: 'none()', labels });
    render(
      <ScriptPreview
        template={TEMPLATE}
        labels={labels}
        preview={preview}
        onRefresh={() => undefined}
      />,
    );
    expect(status()).toHaveTextContent('The script produced nothing.');
    expect(screen.queryByRole('textbox', { name: 'Preview' })).not.toBeInTheDocument();
    view.destroy();
  });

  it.each([
    ['a node the document does not have', [{ type: 'chart' }]],
    ['text outside a block', [{ type: 'text', text: 'Loose' }]],
    ['something that is no content', { rows: 3 }],
  ])('DOCE-EDITOR-4.9 says the output cannot be shown when it is %s', async (_, output) => {
    const view = editorView();
    const runner = producing(output as unknown as StoredContent);
    const preview = await previewScript(view, runner, { source: 'chart()', labels });
    expect(preview.status).toBe('error');
    render(
      <ScriptPreview
        template={TEMPLATE}
        labels={labels}
        preview={preview}
        onRefresh={() => undefined}
      />,
    );
    expect(status()).toHaveTextContent('The script produced content the document cannot hold.');
    expect(screen.queryByRole('textbox', { name: 'Preview' })).not.toBeInTheDocument();
    view.destroy();
  });

  it('DOCE-EDITOR-4.9 says why the runner failed', async () => {
    const view = editorView();
    const failing: ScriptRunnerAdapter = {
      run: () =>
        Promise.resolve({
          ok: false as const,
          error: { kind: 'unavailable' as const, message: 'The script timed out.' },
        }),
    };
    expect(await previewScript(view, failing, { source: 'wait()', labels })).toEqual({
      status: 'error',
      message: 'The script timed out.',
    });
    view.destroy();
  });
});
