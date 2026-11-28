import { act, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState, NodeSelection } from 'prosemirror-state';
import { createRef, type Ref, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { createDocumentEditing, editCaption, markRemote } from '../../engine/index.js';
import { readDocumentFile, type TemplateFile } from '../../model/index.js';
import { DocumentEditor } from './document-editor.js';
import type { DocumentEditorHandle } from './editor-handle.js';
import { SURFACE_LOADERS } from './lazy-surfaces.js';

// The math field's load, which a test makes fail as a dropped connection would.
vi.mock(import('./lazy-surfaces.js'), async (load) => {
  const actual = await load();
  return {
    ...actual,
    SURFACE_LOADERS: { ...actual.SURFACE_LOADERS, math: vi.fn(actual.SURFACE_LOADERS.math) },
  };
});

const TEMPLATE: TemplateFile = { formatVersion: 1, id: 'article' };

const initial = () =>
  EditorState.create({
    doc: readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'Opening words' }] },
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: 'So ' },
                  { type: 'math', attrs: { source: 'x^2' } },
                ],
              },
              {
                type: 'codeBlock',
                content: [
                  { type: 'caption', content: [{ type: 'text', text: 'The board' }] },
                  { type: 'text', text: 'x = 1' },
                ],
              },
            ],
          },
        ],
      },
      documentSchema,
    ).doc,
    plugins: createDocumentEditing(documentSchema),
  });

interface HarnessProps {
  readonly handleRef: Ref<DocumentEditorHandle>;
  readonly notify?: (message: { readonly text: string }) => void;
}

function Harness({ handleRef, notify }: HarnessProps) {
  const [state, setState] = useState(initial);
  return (
    <DocumentEditor
      state={state}
      onStateChange={setState}
      template={TEMPLATE}
      layout="web"
      handleRef={handleRef}
      feedback={notify ? { notify } : undefined}
      aria-label="Report"
    />
  );
}

installEditorDom();

// The mounted editor's handle and view.
function mounted(notify?: HarnessProps['notify']) {
  const handleRef = createRef<DocumentEditorHandle>();
  render(<Harness handleRef={handleRef} notify={notify} />);
  const handle = handleRef.current;
  const view = handle?.view();
  if (!handle || !view) throw new Error('The editor mounts its view.');
  return { handle, view };
}

// Selects the first node of a type, as a click on it does, with the document focused.
function selectNode({ handle, view }: ReturnType<typeof mounted>, typeName: string) {
  let found = -1;
  view.state.doc.descendants((node, pos) => {
    if (found < 0 && node.type.name === typeName) found = pos;
    return found < 0;
  });
  act(() => {
    handle.run((state, dispatch) => {
      dispatch?.(state.tr.setSelection(NodeSelection.create(state.doc, found)));
      return true;
    });
  });
}

// Another writer's words arriving at the start of the document, before the edited object.
function typeRemotely({ view }: ReturnType<typeof mounted>) {
  act(() => view.dispatch(markRemote(view.state.tr.insertText('Earlier ', 2))));
}

describe('ObjectEditors', () => {
  // First, while the field has not loaded yet: once loaded, it stays loaded.
  it('DOCE-ENTRY-2.2 DOCE-ENTRY-2.4 leaves the math as it is when its field fails to load, and loads it again next time', async () => {
    const user = userEvent.setup();
    const notify = vi.fn();
    const editor = mounted(notify);
    const load = vi.mocked(SURFACE_LOADERS.math);
    load.mockRejectedValue(new Error('offline'));
    selectNode(editor, 'math_inline');
    await user.keyboard('{Enter}');
    await vi.waitFor(() => {
      expect(notify).toHaveBeenCalledWith({
        tone: 'error',
        text: 'The math could not be edited. Try again.',
      });
    });
    expect(screen.queryByRole('textbox', { name: 'LaTeX' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Report' })).toHaveTextContent('x^2');
    load.mockRestore();
    selectNode(editor, 'math_inline');
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('textbox', { name: 'LaTeX' })).toHaveValue('x^2');
  });
  it('DOCE-OBJECTS-1.8 keeps the LaTeX being typed while a change before the math moves it', async () => {
    const user = userEvent.setup();
    const editor = mounted();
    selectNode(editor, 'math_inline');
    await user.keyboard('{Enter}');
    const field = await screen.findByRole('textbox', { name: 'LaTeX' });
    await user.type(field, '+y');
    typeRemotely(editor);
    expect(screen.getByRole('textbox', { name: 'LaTeX' })).toBe(field);
    expect(field).toHaveValue('x^2+y');
    expect(field).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('textbox', { name: 'Report' })).toHaveTextContent('x^2+y');
  });

  it('DOCE-OBJECTS-2.3 edits a code block’s caption as text, with no field over it', () => {
    const editor = mounted();
    selectNode(editor, 'code_block');
    act(() => {
      editCaption(editor.view.state, editor.view.dispatch);
    });
    const { $from, from, to } = editor.view.state.selection;
    expect($from.parent.type.name).toBe('code_caption');
    expect(editor.view.state.doc.textBetween(from, to)).toBe('The board');
    expect(screen.queryByRole('textbox', { name: 'Caption' })).not.toBeInTheDocument();
  });

  it('DOCE-OBJECTS-1.8 starts each edit with the math as it is', async () => {
    const user = userEvent.setup();
    const editor = mounted();
    selectNode(editor, 'math_inline');
    await user.keyboard('{Enter}');
    await user.type(await screen.findByRole('textbox', { name: 'LaTeX' }), '+y{Escape}');
    selectNode(editor, 'math_inline');
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('textbox', { name: 'LaTeX' })).toHaveValue('x^2');
  });
});
