import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState, TextSelection } from 'prosemirror-state';
import { createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { createDocumentEditing } from '../../engine/index.js';
import { readDocumentFile, type TemplateFile } from '../../model/index.js';
import { DocumentEditor, type DocumentEditorProps } from './document-editor.js';
import type { DocumentEditorHandle } from './editor-handle.js';

installEditorDom();

const TEMPLATE: TemplateFile = { formatVersion: 1, id: 'plain' };

const initial = () =>
  EditorState.create({
    doc: readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'Intro' }] },
              { type: 'paragraph' },
            ],
          },
        ],
      },
      documentSchema,
    ).doc,
    plugins: createDocumentEditing(documentSchema),
  });

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
        slashMenu
        {...props}
      />
    );
  }
  render(<Editor />);
  await user.click(screen.getByRole('textbox', { name: 'Report' }));
  await waitFor(() => expect(handle.current?.view()).toBeTruthy());
  const view = handle.current?.view();
  if (!view) throw new Error('no view');
  // The caret in the empty paragraph, the last text block.
  act(() => {
    view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
  });
  const type = (text: string) =>
    act(() => {
      view.dispatch(view.state.tr.insertText(text));
    });
  const lastBlock = () => {
    let found = view.state.doc.firstChild;
    view.state.doc.descendants((node) => {
      if (node.isTextblock) found = node;
    });
    return found;
  };
  return { user, view, type, lastBlock };
}

const menu = () => screen.queryByRole('listbox', { name: 'Insert' });

describe('the slash menu', () => {
  it('DOCE-EDITOR-4.22 opens on a typed slash, narrows by the query and inserts the option chosen', async () => {
    const { user, type, lastBlock } = await setup();
    type('/');
    expect(await screen.findByRole('listbox', { name: 'Insert' })).toBeInTheDocument();
    type('head');
    await waitFor(() => expect(screen.getAllByRole('option')[0]).toHaveTextContent('Heading 1'));
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(menu()).toBeNull());
    expect(lastBlock()?.type.name).toBe('heading');
    expect(lastBlock()?.attrs.level).toBe(2);
    expect(lastBlock()?.textContent).toBe('');
  });

  it('DOCE-EDITOR-4.22 moves with the arrows and closes on Escape until another slash', async () => {
    const { user, type, view } = await setup();
    type('/');
    await screen.findByRole('listbox', { name: 'Insert' });
    const options = () => screen.getAllByRole('option');
    expect(options()[0]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}');
    expect(options()[1]).toHaveAttribute('aria-selected', 'true');
    expect(view.dom).toHaveAttribute('aria-activedescendant', options()[1]?.id);
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(options().at(-1)).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(menu()).toBeNull());
    expect(view.dom).not.toHaveAttribute('aria-expanded');
    type('x');
    expect(menu()).toBeNull();
    type(' /');
    expect(await screen.findByRole('listbox', { name: 'Insert' })).toBeInTheDocument();
  });

  it('DOCE-EDITOR-4.22 offers the host options, and says when nothing matches', async () => {
    const run = vi.fn();
    const { user, type } = await setup({
      slashMenu: { items: [{ id: 'sample', label: 'Sample block', keywords: ['demo'], run }] },
    });
    type('/demo');
    expect(await screen.findByRole('option', { name: 'Sample block' })).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(run).toHaveBeenCalledTimes(1);
    type('/zzzz');
    expect(await screen.findByText('No matches')).toBeInTheDocument();
  });

  it('DOCE-EDITOR-4.22 opens from the button on an empty line', async () => {
    const { user } = await setup({ slashMenu: { emptyLineButton: true } });
    await user.click(await screen.findByRole('button', { name: 'Insert block' }));
    expect(await screen.findByRole('listbox', { name: 'Insert' })).toBeInTheDocument();
  });

  it('DOCE-EDITOR-4.22 is off unless the host asks for it', async () => {
    const { type } = await setup({ slashMenu: false });
    type('/');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(menu()).toBeNull();
  });
});
