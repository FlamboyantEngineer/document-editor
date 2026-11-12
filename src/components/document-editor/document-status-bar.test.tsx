import { render, screen } from '@testing-library/react';
import { EditorState } from 'prosemirror-state';
import { type ReactNode, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { createDocumentEditing } from '../../engine/index.js';
import { readDocumentFile, type TemplateFile } from '../../model/index.js';
import { DocumentEditor, type DocumentEditorProps } from './document-editor.js';
import { STATUS_BAR_ITEMS } from './document-status-bar.js';
import { DocumentModeStatus, DocumentWordStatus } from './status-items.js';

const TEMPLATE: TemplateFile = { formatVersion: 1, id: 'article' };

const initial = () =>
  EditorState.create({
    doc: readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Alpha beta gamma' }] }],
          },
        ],
      },
      documentSchema,
    ).doc,
    plugins: createDocumentEditing(documentSchema),
  });

function Harness(
  props: Partial<DocumentEditorProps> & { readonly children?: ReactNode | undefined },
) {
  const [state, setState] = useState(initial);
  return (
    <DocumentEditor
      state={state}
      onStateChange={setState}
      template={TEMPLATE}
      layout="web"
      aria-label="Report"
      {...props}
    />
  );
}

// The items at one end of the bar, by what they report.
function itemsAt(container: HTMLElement, end: 'start' | 'end') {
  return [
    ...container.querySelectorAll(
      `.de-document-editor__status-${end} > .de-document-editor__status-item`,
    ),
  ].map((item) => item.getAttribute('data-status'));
}

installEditorDom();

describe('DocumentStatusBar', () => {
  it('DOCE-EDITOR-5.1 shows the words and the mode, each item naming what it reports', () => {
    const { container } = render(<Harness statusBar onZoomChange={() => undefined} />);
    expect(itemsAt(container, 'start')).toEqual(['page', 'words', 'proofing', 'presence', 'mode']);
    expect(itemsAt(container, 'end')).toEqual(['zoom']);
    const bar = screen.getByRole('group', { name: 'Document status' });
    expect(bar).toHaveTextContent('3 words');
    expect(bar).toHaveTextContent('Editing');
  });

  it('DOCE-EDITOR-5.5 lets the host reorder, drop and move the items and add its own', () => {
    const { container } = render(
      <Harness
        statusBar={{
          arrange: (items) => [
            ...items.filter((item) => item.id !== 'words' && item.id !== 'mode'),
            ...items
              .filter((item) => item.id === 'mode')
              .map((item) => ({ ...item, side: 'end' as const })),
            { id: 'workflow', side: 'end', content: 'In review' },
          ],
        }}
      />,
    );
    expect(itemsAt(container, 'start')).toEqual(['page', 'proofing', 'presence']);
    expect(itemsAt(container, 'end')).toEqual(['mode', 'workflow']);
    expect(screen.getByText('In review')).toBeInTheDocument();
    expect(STATUS_BAR_ITEMS).toContain('words');
  });

  it('DOCE-EDITOR-5.5 shows the status parts a host places inside the editor', () => {
    render(
      <Harness editable={false}>
        <div role="note" aria-label="Host status">
          <DocumentWordStatus />
          <DocumentModeStatus />
        </div>
      </Harness>,
    );
    const note = screen.getByRole('note', { name: 'Host status' });
    expect(note).toHaveTextContent('3 words');
    expect(note).toHaveTextContent('Reading');
  });

  it('DOCE-EDITOR-5.5 shows nothing for a status part outside an editor', () => {
    const { container } = render(<DocumentWordStatus />);
    expect(container).toBeEmptyDOMElement();
  });
});
