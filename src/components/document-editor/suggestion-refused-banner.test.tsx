import { act, render, screen, waitFor, within } from '@testing-library/react';
import { wrapInList } from 'prosemirror-schema-list';
import { type Command, EditorState, TextSelection } from 'prosemirror-state';
import { createRef, type Ref, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { createDocumentEditing } from '../../engine/index.js';
import { BASE_TEMPLATE, readDocumentFile } from '../../model/index.js';
import { DocumentEditor } from './document-editor.js';
import type { DocumentEditorHandle } from './editor-handle.js';

const initial = () =>
  EditorState.create({
    doc: readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Body' }] }],
          },
        ],
      },
      documentSchema,
    ).doc,
    plugins: createDocumentEditing(documentSchema),
  });

function Harness({ handle }: { handle: Ref<DocumentEditorHandle> }) {
  const [state, setState] = useState(initial);
  return (
    <DocumentEditor
      state={state}
      onStateChange={setState}
      template={BASE_TEMPLATE}
      layout="web"
      suggesting
      author="writer"
      handleRef={handle}
      aria-label="Report"
    />
  );
}

// Where the paragraph's text starts.
function textStart(state: EditorState): number {
  let at = 0;
  state.doc.descendants((node, pos) => {
    if (!at && node.isText) at = pos;
    return !at;
  });
  return at;
}

// Wraps the selected blocks in a bulleted list.
const wrapInBullets: Command = (state, dispatch) => {
  const bullets = state.schema.nodes.bullet_list;
  return bullets ? wrapInList(bullets)(state, dispatch) : false;
};

installEditorDom();

describe('a change suggest mode refused', () => {
  it('DOCE-EDITOR-7.8 DOCE-SUGGESTIONS-1.5 tells the writer why until their next change', async () => {
    const handle = createRef<DocumentEditorHandle>();
    render(<Harness handle={handle} />);
    await act(() => handle.current?.whenSettled());
    act(() => {
      handle.current?.run((state, dispatch) => {
        const inside = state.tr.setSelection(TextSelection.create(state.doc, textStart(state)));
        dispatch?.(inside);
        return true;
      });
      handle.current?.run(wrapInBullets);
    });
    const region = await screen.findByRole('region', { name: 'Document notices' });
    const banner = region.querySelector('[data-banner="suggestion-refused"]');
    expect(banner).toBeInTheDocument();
    expect(within(region).getByText('This change was not made')).toBeInTheDocument();
    let listed = false;
    handle.current?.view()?.state.doc.descendants((node) => {
      listed ||= node.type.name === 'bullet_list';
    });
    expect(listed).toBe(false);
    act(() => {
      handle.current?.run((state, dispatch) => {
        dispatch?.(state.tr.insertText('x'));
        return true;
      });
    });
    await waitFor(() =>
      expect(document.querySelector('[data-banner="suggestion-refused"]')).not.toBeInTheDocument(),
    );
  });
});
