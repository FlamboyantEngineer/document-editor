import { act, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState, TextSelection } from 'prosemirror-state';
import { createRef, type Ref, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { createDocumentEditing } from '../../engine/index.js';
import { readDocumentFile, type TemplateFile } from '../../model/index.js';
import { DocumentEditor } from './document-editor.js';
import type { DocumentEditorHandle } from './editor-handle.js';

// A fresh module state: no edit has loaded the math field in this file before the editor warms it.

const TEMPLATE: TemplateFile = { formatVersion: 1, id: 'article' };

const initial = () => {
  const { doc } = readDocumentFile(
    {
      formatVersion: 1,
      sections: [{ name: null, content: [{ type: 'paragraph', content: [] }] }],
    },
    documentSchema,
  );
  const state = EditorState.create({ doc, plugins: createDocumentEditing(documentSchema) });
  return state.apply(state.tr.setSelection(TextSelection.atStart(doc)));
};

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

describe('ObjectEditors, warmed', () => {
  it('DOCE-OBJECTS-1.8 DOCE-ENTRY-2.2 takes the LaTeX typed straight after $$ and Enter, the field warmed while the editor was idle', async () => {
    const user = userEvent.setup();
    const handleRef = createRef<DocumentEditorHandle>();
    render(<Harness handleRef={handleRef} />);
    const view = handleRef.current?.view();
    if (!view) throw new Error('The editor mounts its view.');
    // The editor warms the field once it shows, when the browser is idle; jsdom cannot tell idle,
    // so the editor warms it a second after it shows.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    });
    act(() => view.focus());
    // No wait between starting the edit and typing on.
    await user.keyboard('$$');
    await user.keyboard('{Enter}a+b');
    expect(screen.getByRole('textbox', { name: 'LaTeX' })).toHaveValue('a+b');
  });
});
