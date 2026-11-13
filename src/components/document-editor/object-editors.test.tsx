import { act, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState, NodeSelection } from 'prosemirror-state';
import { createRef, type Ref, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { createDocumentEditing, editCaption, markRemote } from '../../engine/index.js';
import { readDocumentFile, type TemplateFile } from '../../model/index.js';
import { DocumentEditor } from './document-editor.js';
import type { DocumentEditorHandle } from './editor-handle.js';

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
              { type: 'figure', attrs: { src: 'board.png', alt: 'Board', caption: 'The board' } },
            ],
          },
        ],
      },
      documentSchema,
    ).doc,
    plugins: createDocumentEditing(documentSchema),
  });

function Harness({ handleRef }: { handleRef: Ref<DocumentEditorHandle> }) {
  const [state, setState] = useState(initial);
  return (
    <DocumentEditor
      state={state}
      onStateChange={setState}
      template={TEMPLATE}
      layout="web"
      handleRef={handleRef}
      aria-label="Report"
    />
  );
}

installEditorDom();

// The mounted editor's handle and view.
function mounted() {
  const handleRef = createRef<DocumentEditorHandle>();
  render(<Harness handleRef={handleRef} />);
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

  it('DOCE-OBJECTS-2.3 keeps the caption being typed while a change before its object moves it', async () => {
    const user = userEvent.setup();
    const editor = mounted();
    selectNode(editor, 'figure');
    // The command a double click on the caption line runs; the field then takes focus.
    act(() => {
      editCaption(editor.view.state, editor.view.dispatch);
    });
    const field = await screen.findByRole('textbox', { name: 'Caption' });
    await user.type(field, ' at noon');
    typeRemotely(editor);
    expect(screen.getByRole('textbox', { name: 'Caption' })).toBe(field);
    expect(field).toHaveValue('The board at noon');
    await user.keyboard('{Enter}');
    expect(screen.getByRole('textbox', { name: 'Report' })).toHaveTextContent('The board at noon');
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
