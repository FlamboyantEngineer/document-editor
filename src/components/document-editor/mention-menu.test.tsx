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

const PEOPLE = [
  { kind: 'person', id: 'u1', name: 'Ada Lovelace' },
  { kind: 'person', id: 'u2', name: 'Alan Turing' },
  { kind: 'group', id: 'g1', name: 'Analysts' },
  { kind: 'person', id: 'u3', name: 'Grace Hopper' },
];

const find = vi.fn((query: string) =>
  Promise.resolve(
    PEOPLE.filter((person) => person.name.toLowerCase().includes(query.toLowerCase())),
  ),
);
const onMention = vi.fn();
const MENTIONS = { find, onMention };

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
        mentions={MENTIONS}
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

const menu = () => screen.queryByRole('listbox', { name: 'People' });

// The mentions in the document, as their stored attributes.
function mentionsIn(view: { state: EditorState }) {
  const found: { userId: unknown; label: unknown }[] = [];
  view.state.doc.descendants((node) => {
    if (node.type.name === 'mention')
      found.push({ userId: node.attrs.userId, label: node.attrs.label });
  });
  return found;
}

describe('the mention menu', () => {
  it('DOCE-EDITOR-4.23 finds the people for the typed query and mentions the one chosen', async () => {
    const { user, type, view, lastBlock } = await setup();
    type('Ask @a');
    expect(await screen.findByRole('option', { name: 'Ada Lovelace' })).toBeInTheDocument();
    // People only: the document's mentions name a person.
    expect(screen.queryByRole('option', { name: 'Analysts' })).not.toBeInTheDocument();
    type('da L');
    await waitFor(() => expect(find).toHaveBeenLastCalledWith('ada L', expect.any(AbortSignal)));
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));
    await user.keyboard('{Enter}');
    await waitFor(() => expect(menu()).toBeNull());
    expect(mentionsIn(view)).toEqual([{ userId: 'u1', label: 'Ada Lovelace' }]);
    // The mention takes the typed text's place, a space after it.
    expect(lastBlock()?.childCount).toBe(3);
    expect(lastBlock()?.lastChild?.text).toBe(' ');
    expect(onMention).toHaveBeenCalledWith(PEOPLE[0]);
  });

  it('DOCE-EDITOR-4.23 says when nobody matches, and closes on Escape', async () => {
    const { user, type } = await setup();
    type('@zz');
    expect(await screen.findByText('No people found')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByText('No people found')).not.toBeInTheDocument());
  });

  it('DOCE-EDITOR-4.23 opens nothing while the writer cannot edit', async () => {
    const { type } = await setup({ editable: false });
    type('@a');
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(menu()).toBeNull();
  });
});
