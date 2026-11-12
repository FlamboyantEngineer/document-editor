import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState, TextSelection } from 'prosemirror-state';
import { createRef, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { createDocumentEditing, setSearch } from '../../engine/index.js';
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
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello there' }] }],
          },
        ],
      },
      documentSchema,
    ).doc,
    plugins: createDocumentEditing(documentSchema),
  });

function Harness({
  handleRef,
  find = true,
}: {
  handleRef?: React.Ref<DocumentEditorHandle>;
  find?: boolean;
}) {
  const [state, setState] = useState(initial);
  return (
    <DocumentEditor
      state={state}
      onStateChange={setState}
      template={TEMPLATE}
      layout="web"
      find={find}
      handleRef={handleRef}
      aria-label="Report"
    />
  );
}

installEditorDom();

async function openFindBar(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('textbox', { name: 'Report' }));
  await user.keyboard('{Control>}f{/Control}');
  return screen.findByRole('searchbox');
}

describe('DocumentFindBar', () => {
  it('DOCE-SEARCH-2.1 leaves focus in the document while the writer types', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const box = await openFindBar(user);
    expect(box).toHaveFocus();
    const document = screen.getByRole('textbox', { name: 'Report' });
    await user.click(document);
    await user.keyboard('More');
    expect(document).toHaveFocus();
    expect(document).toHaveTextContent('More');
    expect(box).toHaveValue('');
  });

  it('DOCE-SEARCH-2.1 shows the find bar search a host set', async () => {
    const user = userEvent.setup();
    const handleRef = createRef<DocumentEditorHandle>();
    render(<Harness handleRef={handleRef} />);
    const box = await openFindBar(user);
    act(() => {
      handleRef.current?.run(setSearch('there', { caseSensitive: true }));
    });
    expect(box).toHaveValue('there');
    await user.click(screen.getByRole('button', { name: 'Find options' }));
    expect(await screen.findByRole('menuitemcheckbox', { name: 'Match case' })).toBeChecked();
  });
});

// Selects a word of the document through the handle.
function selectWord(handle: DocumentEditorHandle | null, word: string) {
  act(() => {
    handle?.run((state, dispatch) => {
      let from = -1;
      state.doc.descendants((node, pos) => {
        const at = node.isText ? (node.text ?? '').indexOf(word) : -1;
        if (from < 0 && at >= 0) from = pos + at;
        return from < 0;
      });
      dispatch?.(state.tr.setSelection(TextSelection.create(state.doc, from, from + word.length)));
      return true;
    });
  });
}

describe('DocumentFindBar shortcuts', () => {
  it('DOCE-SEARCH-2.2 opens with Mod-F seeded with the selected text', async () => {
    const user = userEvent.setup();
    const handleRef = createRef<DocumentEditorHandle>();
    render(<Harness handleRef={handleRef} />);
    selectWord(handleRef.current, 'there');
    await user.keyboard('{Control>}f{/Control}');
    const box = await screen.findByRole('searchbox');
    expect(box).toHaveValue('there');
    expect(box).toHaveFocus();
  });

  it('DOCE-SEARCH-2.2 opens at the replacement with Mod-H, and Mod-F takes focus back to the box', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('textbox', { name: 'Report' }));
    await user.keyboard('{Control>}h{/Control}');
    const replacement = await screen.findByRole('textbox', { name: /Replace/ });
    await waitFor(() => expect(replacement).toHaveFocus());
    await user.keyboard('{Control>}f{/Control}');
    expect(screen.getByRole('searchbox')).toHaveFocus();
  });

  it('DOCE-SEARCH-2.2 opens from the handle, and only while the editor has a find bar', async () => {
    const handleRef = createRef<DocumentEditorHandle>();
    const { unmount } = render(<Harness handleRef={handleRef} />);
    act(() => {
      expect(handleRef.current?.openFind('replace')).toBe(true);
    });
    expect(await screen.findByRole('searchbox')).toBeInTheDocument();
    unmount();
    const withoutFind = createRef<DocumentEditorHandle>();
    render(<Harness handleRef={withoutFind} find={false} />);
    expect(withoutFind.current?.openFind()).toBe(false);
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });
});
