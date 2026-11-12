import { act, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState, TextSelection } from 'prosemirror-state';
import { createRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { createDocumentEditing, searchState } from '../../engine/index.js';
import { readDocumentFile, type TemplateFile } from '../../model/index.js';
import { DocumentEditor } from '../document-editor/document-editor.js';
import type { DocumentEditorHandle } from '../document-editor/editor-handle.js';
import { DocumentSearchPane } from './document-search-pane.js';

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
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'One cat, two cats, three cats.' }],
              },
            ],
          },
        ],
      },
      documentSchema,
    ).doc,
    plugins: createDocumentEditing(documentSchema),
  });

function Harness({ handleRef }: { handleRef: React.Ref<DocumentEditorHandle> }) {
  const [state, setState] = useState(initial);
  return (
    <DocumentEditor
      state={state}
      onStateChange={setState}
      template={TEMPLATE}
      layout="web"
      find
      handleRef={handleRef}
      panels={{ end: <DocumentSearchPane template={TEMPLATE} /> }}
      aria-label="Report"
    />
  );
}

installEditorDom();

describe('DocumentSearchPane', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('DOCE-SEARCH-3.2 searches once the reader pauses, apart from the find bar', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const handleRef = createRef<DocumentEditorHandle>();
    render(<Harness handleRef={handleRef} />);
    const box = screen.getByRole('searchbox');
    await user.type(box, 'cat');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getAllByRole('option')).toHaveLength(3);
    const view = handleRef.current?.view();
    expect(view && searchState(view.state)?.query).toBe('');
    expect(view && searchState(view.state, 'pane')?.query).toBe('cat');
  });

  it('DOCE-SEARCH-3.2 takes the reader to a result without moving the caret', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const handleRef = createRef<DocumentEditorHandle>();
    render(<Harness handleRef={handleRef} />);
    act(() => {
      handleRef.current?.run((state, dispatch) => {
        dispatch?.(state.tr.setSelection(TextSelection.atStart(state.doc)));
        return true;
      });
    });
    const caret = handleRef.current?.view()?.state.selection.from;
    await user.type(screen.getByRole('searchbox'), 'cat');
    act(() => {
      vi.advanceTimersByTime(300);
    });
    await user.click(screen.getAllByRole('option')[2] as HTMLElement);
    const view = handleRef.current?.view();
    expect(view && searchState(view.state, 'pane')?.current).toBe(2);
    expect(view?.state.selection.from).toBe(caret);
    expect(view?.state.selection.empty).toBe(true);
  });

  it('DOCE-SEARCH-3.2 announces how many matches Replace all replaced', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Harness handleRef={createRef()} />);
    await user.type(screen.getByRole('searchbox'), 'cat');
    act(() => {
      vi.advanceTimersByTime(300);
    });
    await user.click(screen.getByRole('button', { name: /replace/i, expanded: false }));
    await user.type(screen.getByRole('textbox', { name: /replace/i }), 'dog');
    await user.click(screen.getByRole('button', { name: /replace all/i }));
    const document = screen.getByRole('textbox', { name: 'Report' });
    expect(document).toHaveTextContent('One dog, two dogs, three dogs.');
    const status = screen
      .getAllByRole('status')
      .find((region) => region.textContent?.includes('Replaced'));
    expect(status).toHaveTextContent('Replaced 3 matches');
    expect(within(document).queryByText('cat')).not.toBeInTheDocument();
  });
});
