import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState } from 'prosemirror-state';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { createDocumentEditing, createPresence, setPeers } from '../../engine/index.js';
import { readDocumentFile, type TemplateFile } from '../../model/index.js';
import { DocumentEditor } from '../document-editor/document-editor.js';
import { DocumentContributors } from './document-contributors.js';

const TEMPLATE: TemplateFile = { formatVersion: 1, id: 'article' };

// Twelve writers, more than the default eight slots, each present too.
const WRITERS = Array.from({ length: 12 }, (_, index) => `writer-${String(index)}`);

function initial() {
  const doc = readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: WRITERS.map((author, index) => ({
            type: 'paragraph',
            attrs: { id: `p${String(index)}`, author },
            content: [{ type: 'text', text: `Written by ${author}.` }],
          })),
        },
      ],
    },
    documentSchema,
  ).doc;
  const state = EditorState.create({
    doc,
    plugins: [...createDocumentEditing(documentSchema), createPresence()],
  });
  return state.apply(
    setPeers(
      state,
      WRITERS.map((id) => ({ id, name: id, anchor: 1, head: 1 })),
    ),
  );
}

function Host() {
  const [state, setState] = useState(initial);
  const [slots, setSlots] = useState(8);
  return (
    <>
      <button type="button" onClick={() => setSlots(50)}>
        Fifty
      </button>
      <DocumentEditor
        state={state}
        onStateChange={setState}
        template={TEMPLATE}
        layout="web"
        aria-label="Report"
        authorship
        colorSlots={slots}
      >
        <DocumentContributors />
      </DocumentEditor>
    </>
  );
}

installEditorDom();

// Each contributor row's slot, and the colour its avatar publishes.
const rows = () =>
  within(screen.getByRole('region', { name: 'Contributors' }))
    .getAllByRole('listitem')
    .map((row) => ({
      slot: row.getAttribute('data-author-slot'),
      color: row.querySelector('[data-color]')?.getAttribute('data-color'),
    }));

describe('the contributors pane', () => {
  it('DOCE-COLLAB-1.8 DOCE-COLLAB-3.4 places the writers in the editor’s count of colour slots', async () => {
    const user = userEvent.setup();
    const { container } = render(<Host />);
    await waitFor(() => expect(rows()).toHaveLength(12));
    expect(new Set(rows().map((row) => row.slot)).size).toBe(8);
    await user.click(screen.getByRole('button', { name: 'Fifty' }));
    await waitFor(() => expect(new Set(rows().map((row) => row.slot)).size).toBe(12));
    // Each avatar shows the row's own slot, not one wrapped into eight.
    for (const row of rows()) expect(row.color).toBe(row.slot);
    // The text and the carets take the same count.
    const tinted = new Set(
      [...container.querySelectorAll('[data-author-slot]')]
        .filter((element) => !element.closest('[role="region"]'))
        .map((element) => element.getAttribute('data-author-slot')),
    );
    expect(tinted.size).toBe(12);
    const carets = new Set(
      [...container.querySelectorAll('.de-presence-caret')].map((caret) =>
        caret.getAttribute('data-presence-slot'),
      ),
    );
    expect(carets.size).toBe(12);
  });
});
