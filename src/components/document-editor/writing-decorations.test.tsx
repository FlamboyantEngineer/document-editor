import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState, TextSelection } from 'prosemirror-state';
import { createRef, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { createDocumentEditing, type DocumentEditingOptions } from '../../engine/index.js';
import { readDocumentFile, type StoredNode, type TemplateFile } from '../../model/index.js';
import { DocumentEditor, type DocumentEditorProps } from './document-editor.js';
import type { DocumentEditorHandle } from './editor-handle.js';
import { writingDecorations } from './writing-decorations.js';

installEditorDom();

const TEMPLATE: TemplateFile = { formatVersion: 1, id: 'plain' };

const paragraph = (text: string): StoredNode => ({
  type: 'paragraph',
  content: text ? [{ type: 'text', text }] : [],
});

const stateOf = (content: StoredNode[], options: DocumentEditingOptions = {}) =>
  EditorState.create({
    doc: readDocumentFile({ formatVersion: 1, sections: [{ name: null, content }] }, documentSchema)
      .doc,
    plugins: createDocumentEditing(documentSchema, options),
  });

async function setup(
  content: StoredNode[],
  props: Partial<DocumentEditorProps> = {},
  options: DocumentEditingOptions = {},
) {
  const user = userEvent.setup();
  const handle = createRef<DocumentEditorHandle>();
  function Editor() {
    const [state, setState] = useState(() => stateOf(content, options));
    return (
      <DocumentEditor
        handleRef={handle}
        state={state}
        onStateChange={setState}
        template={TEMPLATE}
        layout="web"
        aria-label="Report"
        {...props}
      />
    );
  }
  render(<Editor />);
  const textbox = screen.getByRole('textbox', { name: 'Report' });
  await user.click(textbox);
  await waitFor(() => expect(handle.current?.view()).toBeTruthy());
  const view = handle.current?.view();
  if (!view) throw new Error('no view');
  return { user, view, textbox };
}

const hint = (kind: string) =>
  document.querySelector(`.de-placeholder[data-placeholder-kind="${kind}"]`);

describe('the writing helpers in the editor', () => {
  it('DOCE-EDITOR-4.24 shows a placeholder in an empty document, and on an empty line', async () => {
    const { view } = await setup([paragraph('')], {
      placeholderText: { document: 'Start writing', emptyLine: 'Type / for blocks' },
    });
    await waitFor(() => expect(hint('document')).toHaveTextContent('Start writing'));
    expect(hint('document')).toHaveAttribute('aria-hidden', 'true');
    act(() => {
      view.dispatch(view.state.tr.insertText('Text'));
    });
    await waitFor(() => expect(hint('document')).toBeNull());
    act(() => {
      view.dispatch(view.state.tr.split(view.state.selection.from));
    });
    await waitFor(() => expect(hint('line')).toHaveTextContent('Type / for blocks'));
    act(() => {
      view.dispatch(view.state.tr.setSelection(TextSelection.atStart(view.state.doc)));
    });
    await waitFor(() => expect(hint('line')).toBeNull());
  });

  it('DOCE-EDITOR-4.25 shows formatting marks on the root and the spaces', async () => {
    const { textbox } = await setup([paragraph('Two words here')], { formattingMarks: true });
    const root = textbox.closest('.de-document-editor');
    expect(root).toHaveAttribute('data-formatting-marks', 'true');
    await waitFor(() => expect(textbox.querySelectorAll('.de-formatting-space')).toHaveLength(1));
    expect(textbox.querySelectorAll('.de-formatting-nbsp')).toHaveLength(1);
  });

  it('DOCE-EDITOR-4.26 marks the text block holding the caret', async () => {
    const { view, textbox } = await setup([paragraph('One'), paragraph('Two')], {
      caretBlock: true,
    });
    act(() => {
      view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
    });
    await waitFor(() =>
      expect(textbox.querySelector('[data-caret-block]')).toHaveTextContent('Two'),
    );
    expect(textbox.querySelectorAll('[data-caret-block]')).toHaveLength(1);
  });

  it('DOCE-EDITOR-5.7 shows the words against the limit the editing keeps', async () => {
    await setup([paragraph('Three words here')], { statusBar: true }, { limit: { words: 5 } });
    expect(await screen.findByText('3 / 5 words')).toBeInTheDocument();
  });
});

describe('writingDecorations', () => {
  it('DOCE-EDITOR-4.25 finds the spaces again only where the document changed', () => {
    const decorations = writingDecorations({ formattingMarks: true });
    if (!decorations) throw new Error('no decorations');
    let state = stateOf([paragraph('a b c'), paragraph('d e')]);
    expect(decorations(state).find()).toHaveLength(3);
    state = state.apply(state.tr.setSelection(TextSelection.atEnd(state.doc)));
    state = state.apply(state.tr.insertText(' f'));
    const found = decorations(state).find();
    expect(found).toHaveLength(4);
    expect(found.map((each) => state.doc.textBetween(each.from, each.to))).toEqual([
      ' ',
      ' ',
      ' ',
      ' ',
    ]);
    state = state.apply(state.tr.delete(2, 6));
    const after = decorations(state).find();
    expect(after.every((each) => state.doc.textBetween(each.from, each.to) === ' ')).toBe(true);
    let spaces = 0;
    state.doc.descendants((node) => {
      spaces += (node.text ?? '').split(' ').length - 1;
    });
    expect(after).toHaveLength(spaces);
  });

  it('DOCE-EDITOR-4.24 draws nothing while no helper is on', () => {
    expect(writingDecorations({})).toBeNull();
  });
});
