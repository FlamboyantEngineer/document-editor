// What a host builds on the editor's handle and notifications: opening a blank document ready to
// type in, and a link to an element or to a span of its text followed once.

import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState, TextSelection } from 'prosemirror-state';
import { createRef, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { createDocumentEditing } from '../../engine/index.js';
import { type DocumentFile, readDocumentFile, type TemplateFile } from '../../model/index.js';
import { DocumentEditor } from './document-editor.js';
import type { DocumentEditorHandle } from './editor-handle.js';

const TEMPLATE: TemplateFile = {
  formatVersion: 1,
  id: 'article',
  page: { size: 'A4', margins: { top: '24px', right: '24px', bottom: '24px', left: '24px' } },
};

const paragraph = (id: string, text: string) => ({
  type: 'paragraph',
  attrs: { id },
  content: text ? [{ type: 'text', text }] : [],
});

const stateOf = (content: DocumentFile['sections'][number]['content']) =>
  EditorState.create({
    doc: readDocumentFile({ formatVersion: 1, sections: [{ name: null, content }] }, documentSchema)
      .doc,
    plugins: createDocumentEditing(documentSchema),
  });

const LINKED = [
  paragraph('b2b2b2b2', 'The opening words.'),
  paragraph('c3c3c3c3', 'Pumps start in order.'),
  paragraph('d4d4d4d4', 'The closing words.'),
];

function Harness({
  initial,
  handle,
  onLayoutReady,
}: {
  initial: EditorState;
  handle: React.RefObject<DocumentEditorHandle | null>;
  onLayoutReady?: () => void;
}) {
  const [state, setState] = useState(initial);
  return (
    <>
      <input aria-label="Search" />
      <DocumentEditor
        state={state}
        onStateChange={setState}
        template={TEMPLATE}
        layout="web"
        aria-label="Report"
        handleRef={handle}
        onLayoutReady={onLayoutReady}
      />
    </>
  );
}

installEditorDom();

// The host's own rule: focus a blank document once it is ready, unless the reader is elsewhere.
const focusWhenFree = (handle: React.RefObject<DocumentEditorHandle | null>) => () => {
  if (document.activeElement === document.body) handle.current?.focus();
};

describe('host seams', () => {
  it('DOCE-EDITOR-6.3 DOCE-EDITOR-6.7 opens a blank document with the caret in its first paragraph', async () => {
    const handle = createRef<DocumentEditorHandle>();
    render(
      <Harness
        initial={stateOf([paragraph('a1a1a1a1', '')])}
        handle={handle}
        onLayoutReady={focusWhenFree(handle)}
      />,
    );
    const view = await waitFor(() => {
      const current = handle.current?.view();
      expect(current?.hasFocus()).toBe(true);
      return current;
    });
    expect(view?.state.selection.$from.parent.attrs.dataId).toBe('a1a1a1a1');
  });

  it('DOCE-EDITOR-6.3 DOCE-EDITOR-6.7 leaves focus where the reader already put it', async () => {
    const user = userEvent.setup();
    const handle = createRef<DocumentEditorHandle>();
    const ready = { done: false };
    render(
      <Harness
        initial={stateOf([paragraph('a1a1a1a1', '')])}
        handle={handle}
        onLayoutReady={() => {
          ready.done = true;
          focusWhenFree(handle)();
        }}
      />,
    );
    await user.click(screen.getByLabelText('Search'));
    await waitFor(() => expect(ready.done).toBe(true));
    expect(screen.getByLabelText('Search')).toHaveFocus();
  });

  it('DOCE-EDITOR-6.3 follows a link to a span of an element once, and later edits stay put', async () => {
    const handle = createRef<DocumentEditorHandle>();
    render(<Harness initial={stateOf(LINKED)} handle={handle} />);
    await waitFor(() => expect(handle.current?.view()).not.toBeNull());
    expect(handle.current?.select({ elementId: 'c3c3c3c3', from: 0, to: 5 })).toBe(true);
    const view = handle.current?.view();
    const { from, to } = view?.state.selection ?? { from: 0, to: 0 };
    expect(view?.state.doc.textBetween(from, to)).toBe('Pumps');
    // The reader moves on and types; nothing takes them back to the linked span.
    if (view) {
      const end = view.state.selection.$from.end();
      const caret = TextSelection.create(view.state.doc, end);
      view.dispatch(view.state.tr.setSelection(caret).insertText(' now'));
    }
    expect(view?.state.selection.$from.parent.textContent).toBe('Pumps start in order. now');
    expect(view?.state.selection.empty).toBe(true);
    expect(handle.current?.scrollToElement('d4d4d4d4')).toBe(true);
    expect(view?.state.selection.$from.parent.attrs.dataId).toBe('d4d4d4d4');
  });
});
