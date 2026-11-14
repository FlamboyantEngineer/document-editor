import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { toggleMark } from 'prosemirror-commands';
import { EditorState, TextSelection } from 'prosemirror-state';
import { createRef, memo, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { createDocumentEditing } from '../../engine/index.js';
import { readDocumentFile, type TemplateFile } from '../../model/index.js';
import { DocumentEditor } from './document-editor.js';
import type { DocumentEditorHandle } from './editor-handle.js';
import { useDocumentEditorState } from './editor-store.js';

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
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: 'Bold', marks: [{ type: 'bold' }] },
                  { type: 'text', text: ' plain text' },
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

describe('the editor state for a host component', () => {
  it('DOCE-EDITOR-4.20 draws a component again only when the part it reads changes', async () => {
    const draws: boolean[] = [];
    function BoldShown() {
      const bold = useDocumentEditorState((editor) => editor.isActive('strong'));
      draws.push(Boolean(bold));
      return <output aria-label="Bold">{bold ? 'on' : 'off'}</output>;
    }
    // Drawn again by its parent only when its props change, which they never do.
    const Shown = memo(BoldShown);
    let move: (text: string) => void = () => undefined;
    function Editor() {
      const [state, setState] = useState(initial);
      move = (text) =>
        setState((current) =>
          current.apply(
            current.tr.setSelection(TextSelection.create(current.doc, startOf(current, text) + 1)),
          ),
        );
      return (
        <DocumentEditor
          state={state}
          onStateChange={setState}
          template={TEMPLATE}
          layout="web"
          aria-label="Report"
        >
          <Shown />
        </DocumentEditor>
      );
    }
    render(<Editor />);
    move('plain');
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Bold' })).toHaveTextContent('off'),
    );
    const settled = draws.length;
    move('text');
    move('lain');
    await waitFor(() => expect(draws.length).toBe(settled));
    move('Bold');
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Bold' })).toHaveTextContent('on'),
    );
    expect(draws.length).toBe(settled + 1);
  });

  it('DOCE-EDITOR-4.20 reads null outside an editor', () => {
    function Outside() {
      const value = useDocumentEditorState(() => 'inside');
      return <output aria-label="Value">{String(value)}</output>;
    }
    render(<Outside />);
    expect(screen.getByRole('status', { name: 'Value' })).toHaveTextContent('null');
  });

  it('DOCE-EDITOR-6.3 tells whether a command can run and whether a mark holds, without running it', async () => {
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
        />
      );
    }
    render(<Editor />);
    await user.click(screen.getByRole('textbox', { name: 'Report' }));
    await waitFor(() => expect(handle.current?.view()).toBeTruthy());
    const view = handle.current?.view();
    if (!view) throw new Error('no view');
    const at = startOf(view.state, 'Bold') + 2;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
    expect(handle.current?.isActive('strong')).toBe(true);
    expect(handle.current?.isActive('heading')).toBe(false);
    const before = view.state.doc;
    expect(handle.current?.can(toggleMark(strong))).toBe(true);
    expect(view.state.doc).toBe(before);
  });
});
