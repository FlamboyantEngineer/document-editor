import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState, TextSelection } from 'prosemirror-state';
import { createRef, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { createDocumentEditing } from '../../engine/index.js';
import { readDocumentFile, type TemplateFile } from '../../model/index.js';
import { DocumentEditor, type DocumentEditorProps } from './document-editor.js';
import type { DocumentEditorHandle } from './editor-handle.js';

installEditorDom();

const TEMPLATE: TemplateFile = { formatVersion: 1, id: 'plain' };

const strong = documentSchema.marks.strong;
if (!strong) throw new Error('no strong mark');

const initial = () =>
  EditorState.create({
    doc: readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Some plain text' }] }],
          },
        ],
      },
      documentSchema,
    ).doc,
    plugins: createDocumentEditing(documentSchema),
  });

// Where a text starts in the document.
function startOf(state: EditorState, text: string): number {
  let found = -1;
  state.doc.descendants((node, pos) => {
    const at = node.isText ? (node.text ?? '').indexOf(text) : -1;
    if (found < 0 && at >= 0) found = pos + at;
    return found < 0;
  });
  return found;
}

async function setup(props: Partial<DocumentEditorProps> = {}) {
  const user = userEvent.setup();
  const handle = createRef<DocumentEditorHandle>();
  function Editor() {
    const [state, setState] = useState(initial);
    return (
      <DocumentEditor
        handleRef={handle}
        state={state}
        onStateChange={setState}
        template={TEMPLATE}
        layout="web"
        aria-label="Report"
        selectionToolbar
        {...props}
      />
    );
  }
  render(<Editor />);
  await user.click(screen.getByRole('textbox', { name: 'Report' }));
  await waitFor(() => expect(handle.current?.view()).toBeTruthy());
  const view = handle.current?.view();
  if (!view) throw new Error('no view');
  const select = (text: string) => {
    const from = startOf(view.state, text);
    act(() => {
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, from, from + text.length)),
      );
    });
  };
  return { user, view, select };
}

const toolbar = () => screen.queryByRole('toolbar', { name: 'Selection formatting' });

describe('the selection toolbar', () => {
  it('DOCE-EDITOR-4.21 shows over selected text and formats it', async () => {
    const { user, view, select } = await setup();
    expect(toolbar()).toBeNull();
    select('plain');
    await waitFor(() => expect(toolbar()).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Bold' }));
    const { from, to } = view.state.selection;
    expect(view.state.doc.rangeHasMark(from, to, strong)).toBe(true);
    act(() => {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)));
    });
    await waitFor(() => expect(toolbar()).toBeNull());
  });

  it('DOCE-EDITOR-4.21 takes focus on Alt+F10 and hides on Escape until the selection changes', async () => {
    const { user, select } = await setup();
    select('plain');
    await waitFor(() => expect(toolbar()).toBeInTheDocument());
    await user.keyboard('{Alt>}{F10}{/Alt}');
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(toolbar()).toBeNull());
    expect(screen.getByRole('textbox', { name: 'Report' })).toHaveFocus();
    select('text');
    await waitFor(() => expect(toolbar()).toBeInTheDocument());
  });

  it('DOCE-EDITOR-4.21 is off unless the host asks for it', async () => {
    const { select } = await setup({ selectionToolbar: false });
    select('plain');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(toolbar()).toBeNull();
  });

  it('DOCE-EDITOR-4.21 adds the host items to their groups', async () => {
    const { select } = await setup({
      selectionToolbar: {
        items: [
          { kind: 'button', id: 'shout', group: 'marks', label: 'Shout', run: () => undefined },
        ],
      },
    });
    select('plain');
    expect(await screen.findByRole('button', { name: 'Shout' })).toBeInTheDocument();
  });
});
