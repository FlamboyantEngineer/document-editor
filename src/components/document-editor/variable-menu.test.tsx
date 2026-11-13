import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState, TextSelection } from 'prosemirror-state';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { documentSchema, findNode } from '../../../test/document-markup.js';
import { createDocumentEditing } from '../../engine/index.js';
import type { VariablesAdapter } from '../../host/index.js';
import { readDocumentFile, type TemplateFile } from '../../model/index.js';
import { DocumentEditor } from './document-editor.js';

const TEMPLATE: TemplateFile = { formatVersion: 1, id: 'article' };

// A paragraph reading "Hello", the caret after its "He".
function initial(): EditorState {
  const file = {
    formatVersion: 1 as const,
    sections: [
      { name: null, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] },
    ],
  };
  const state = EditorState.create({
    doc: readDocumentFile(file, documentSchema).doc,
    plugins: createDocumentEditing(documentSchema),
  });
  let caret = -1;
  state.doc.descendants((node, pos) => {
    if (node.isText && caret < 0) caret = pos + 2;
    return caret < 0;
  });
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, caret)));
}

function Editor({
  variables,
  onState,
}: {
  variables?: VariablesAdapter;
  onState: (state: EditorState) => void;
}) {
  const [state, setState] = useState(initial);
  onState(state);
  return (
    <DocumentEditor
      state={state}
      onStateChange={setState}
      template={TEMPLATE}
      variables={variables}
      toolbar
      aria-label="Report"
    />
  );
}

describe('variable menu', () => {
  it("DOCE-TEMPLATES-8.5 lists the editor's and the host's variables and inserts the one picked", async () => {
    const user = userEvent.setup();
    let shown = initial();
    const variables: VariablesAdapter = {
      value: () => null,
      catalog: () => [{ key: 'document.name', label: 'Document name' }],
    };
    render(<Editor variables={variables} onState={(state) => (shown = state)} />);
    await user.click(await screen.findByRole('button', { name: 'Variable' }));
    expect(screen.getByRole('menuitem', { name: 'Page number' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Page count' })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Document name' }));
    await waitFor(() =>
      expect(findNode(shown.doc, 'template_variable')?.attrs.variableKey).toBe('document.name'),
    );
    expect(shown.doc.textBetween(0, shown.doc.content.size)).toBe('Hello');
  });

  it('DOCE-TEMPLATES-8.5 is left out while the host lists no variables', async () => {
    render(<Editor variables={{ value: () => null }} onState={() => undefined} />);
    await screen.findByRole('button', { name: 'Undo' });
    expect(screen.queryByRole('button', { name: 'Variable' })).not.toBeInTheDocument();
  });
});
