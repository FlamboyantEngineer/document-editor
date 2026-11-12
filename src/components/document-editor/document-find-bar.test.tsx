import { act, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState } from 'prosemirror-state';
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

function Harness({ handleRef }: { handleRef?: React.Ref<DocumentEditorHandle> }) {
  const [state, setState] = useState(initial);
  return (
    <DocumentEditor
      state={state}
      onStateChange={setState}
      template={TEMPLATE}
      layout="web"
      find
      handleRef={handleRef}
      aria-label="Report"
    />
  );
}

installEditorDom();

async function openFind(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('textbox', { name: 'Report' }));
  await user.keyboard('{Control>}f{/Control}');
  return screen.findByRole('searchbox');
}

describe('DocumentFindBar', () => {
  it('DOCE-SEARCH-2.1 leaves focus in the document while the writer types', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const box = await openFind(user);
    expect(box).toHaveFocus();
    const document = screen.getByRole('textbox', { name: 'Report' });
    await user.click(document);
    await user.keyboard('More');
    expect(document).toHaveFocus();
    expect(document).toHaveTextContent('More');
    expect(box).toHaveValue('');
  });

  it('DOCE-SEARCH-2.1 shows the search the plugin holds, whichever control set it', async () => {
    const user = userEvent.setup();
    const handleRef = createRef<DocumentEditorHandle>();
    render(<Harness handleRef={handleRef} />);
    const box = await openFind(user);
    act(() => {
      handleRef.current?.run(setSearch('there', { caseSensitive: true }));
    });
    expect(box).toHaveValue('there');
    await user.click(screen.getByRole('button', { name: 'Find options' }));
    expect(await screen.findByRole('menuitemcheckbox', { name: 'Match case' })).toBeChecked();
  });
});
