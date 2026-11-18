import { act, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState, TextSelection } from 'prosemirror-state';
import { createRef, type Ref, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { createDocumentEditing, searchState } from '../../engine/index.js';
import { readDocumentFile, type TemplateFile } from '../../model/index.js';
import { DocumentEditor } from '../document-editor/document-editor.js';
import type { DocumentEditorHandle } from '../document-editor/editor-handle.js';
import { DocumentSidePanel } from './document-side-panel.js';

const TEMPLATE: TemplateFile = { formatVersion: 1, id: 'article' };

const initial = () =>
  EditorState.create({
    doc: readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'One cat, two cats.' }] },
            ],
          },
        ],
      },
      documentSchema,
    ).doc,
    plugins: createDocumentEditing(documentSchema),
  });

// An editor whose find keys go to the search pane, in a collapsed side panel unless left out.
function Harness({
  handleRef,
  pane = true,
}: {
  handleRef: Ref<DocumentEditorHandle>;
  pane?: boolean;
}) {
  const [state, setState] = useState(initial);
  return (
    <DocumentEditor
      state={state}
      onStateChange={setState}
      template={TEMPLATE}
      layout="web"
      find="pane"
      handleRef={handleRef}
      panels={{
        end: (
          <DocumentSidePanel
            position="end"
            template={TEMPLATE}
            panes={pane ? ['outline', 'search'] : ['outline']}
            defaultExpanded={false}
          />
        ),
      }}
      aria-label="Report"
    />
  );
}

const documentBox = () => screen.getByRole('textbox', { name: 'Report' });

// Selects a piece of the document's text.
function select(handle: DocumentEditorHandle | null, text: string) {
  act(() => {
    handle?.run((state, dispatch) => {
      let from = -1;
      state.doc.descendants((node, pos) => {
        if (from < 0 && node.isText && node.text?.includes(text)) {
          from = pos + (node.text.indexOf(text) ?? 0);
        }
      });
      dispatch?.(state.tr.setSelection(TextSelection.create(state.doc, from, from + text.length)));
      return true;
    });
  });
}

installEditorDom();

describe('find keys to the search pane', () => {
  it('DOCE-SEARCH-2.2 DOCE-SEARCH-3.2 opens the search pane at its query on Mod-F, seeded with the selection', async () => {
    const user = userEvent.setup();
    const handle = createRef<DocumentEditorHandle>();
    render(<Harness handleRef={handle} />);
    await waitFor(() => expect(handle.current).not.toBeNull());
    select(handle.current, 'cat');
    documentBox().focus();
    await user.keyboard('{Control>}f{/Control}');
    const details = screen.getByRole('region', { name: 'Details' });
    const tab = within(details).getByRole('tab', { name: 'Search' });
    await waitFor(() => expect(tab).toHaveAttribute('aria-selected', 'true'));
    const query = await screen.findByRole('searchbox');
    await waitFor(() => expect(query).toHaveFocus());
    expect(query).toHaveValue('cat');
    expect(screen.queryByRole('search', { name: /find/i })).not.toBeInTheDocument();
    const view = handle.current?.view();
    expect(view && searchState(view.state, 'pane')?.matches).toHaveLength(2);
    expect(view && searchState(view.state, 'find')?.query).toBe('');
  });

  it('DOCE-SEARCH-2.2 opens the pane at its replacement on Mod-H', async () => {
    const user = userEvent.setup();
    const handle = createRef<DocumentEditorHandle>();
    render(<Harness handleRef={handle} />);
    await waitFor(() => expect(handle.current).not.toBeNull());
    documentBox().focus();
    await user.keyboard('{Control>}h{/Control}');
    const replacement = await screen.findByRole('textbox', { name: /replace/i });
    await waitFor(() => expect(replacement).toHaveFocus());
  });

  it('DOCE-SEARCH-2.2 leaves the key to the browser while no panel holds the search pane', async () => {
    const handle = createRef<DocumentEditorHandle>();
    render(<Harness handleRef={handle} pane={false} />);
    await waitFor(() => expect(handle.current).not.toBeNull());
    const key = new KeyboardEvent('keydown', {
      key: 'f',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    documentBox().dispatchEvent(key);
    expect(key.defaultPrevented).toBe(false);
    expect(handle.current?.openFind()).toBe(false);
  });

  it('DOCE-SEARCH-3.2 leaves the pane on Escape for the current match, its results kept', async () => {
    const user = userEvent.setup();
    const handle = createRef<DocumentEditorHandle>();
    render(<Harness handleRef={handle} />);
    await waitFor(() => expect(handle.current).not.toBeNull());
    select(handle.current, 'cat');
    documentBox().focus();
    await user.keyboard('{Control>}f{/Control}');
    const query = await screen.findByRole('searchbox');
    await waitFor(() => expect(query).toHaveFocus());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(documentBox()).toHaveFocus());
    expect(query).toHaveValue('cat');
    expect(screen.getAllByRole('option')).toHaveLength(2);
    const view = handle.current?.view();
    const search = view ? searchState(view.state, 'pane') : null;
    expect(search?.matches).toHaveLength(2);
    expect(search?.decorations.find()).toHaveLength(0);
  });
});
