import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState } from 'prosemirror-state';
import { createRef, type Ref, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { createDocumentEditing } from '../../engine/index.js';
import { readDocumentFile, type TemplateFile } from '../../model/index.js';
import { DocumentEditor } from './document-editor.js';
import type { DocumentEditorHandle } from './editor-handle.js';
import type { DocumentLayout } from './use-document-layout.js';

const TEMPLATE: TemplateFile = {
  formatVersion: 1,
  id: 'article',
  page: { size: 'A4', margins: { top: '24px', right: '24px', bottom: '24px', left: '24px' } },
};

const initial = () =>
  EditorState.create({
    doc: readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
          },
        ],
      },
      documentSchema,
    ),
    plugins: createDocumentEditing(documentSchema),
  });

function Harness({
  editable,
  layout,
  handleRef,
}: {
  editable: boolean;
  layout: DocumentLayout;
  handleRef?: Ref<DocumentEditorHandle>;
}) {
  const [state, setState] = useState(initial);
  return (
    <DocumentEditor
      state={state}
      onStateChange={setState}
      template={TEMPLATE}
      layout={layout}
      editable={editable}
      aria-label="Report"
      handleRef={handleRef}
    />
  );
}

installEditorDom();

describe('DocumentEditor', () => {
  it('DOCE-EDITOR-1.1 shows the document with its layout, mode and template values', () => {
    const { container } = render(<Harness editable layout="web" />);
    const document = screen.getByRole('textbox', { name: 'Report' });
    expect(document).toHaveTextContent('Hello');
    const root = container.querySelector('.de-document-editor');
    expect(root).toHaveAttribute('data-layout', 'web');
    expect(root).toHaveAttribute('data-mode', 'authoring');
    expect(root?.getAttribute('style')).toContain('--doc-page-margin-left: 24px');
    expect(container.querySelector('.de-document-editor__measure')).toBeNull();
  });

  it('DOCE-EDITOR-1.2 switches between reading and authoring, keeping the document', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness editable layout="web" />);
    const document = screen.getByRole('textbox', { name: 'Report' });
    await user.click(document);
    await user.keyboard('More');
    expect(document).toHaveTextContent(/(?=.*Hello)(?=.*More)/);
    rerender(<Harness editable={false} layout="web" />);
    const read = screen.getByRole('textbox', { name: 'Report' });
    expect(read).toHaveAttribute('aria-readonly', 'true');
    expect(read).toHaveAttribute('contenteditable', 'false');
    expect(read).toHaveTextContent(/(?=.*Hello)(?=.*More)/);
  });

  it('DOCE-EDITOR-1.3 measures the pages in a hidden slot in page layout', () => {
    const { container } = render(<Harness editable layout="page" />);
    const measure = container.querySelector('.de-document-editor__measure');
    expect(measure).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('.de-document-editor')).toHaveAttribute('data-layout', 'page');
  });

  it('DOCE-EDITOR-6.12 publishes the layout state and settles its pages', async () => {
    const handle = createRef<DocumentEditorHandle>();
    const { container } = render(<Harness editable layout="page" handleRef={handle} />);
    const root = container.querySelector('.de-document-editor');
    expect(root).toHaveAttribute('data-layout-state', 'pending');
    await expect(handle.current?.whenSettled()).resolves.toBe('settled');
    await waitFor(() => expect(root).toHaveAttribute('data-layout-state', 'settled'));
    expect(handle.current?.layoutStats()).toMatchObject({ layouts: 1, blocksMeasured: 1 });
  });

  it('DOCE-EDITOR-6.12 is settled at once in the web layout', async () => {
    const handle = createRef<DocumentEditorHandle>();
    const { container } = render(<Harness editable layout="web" handleRef={handle} />);
    expect(container.querySelector('.de-document-editor')).toHaveAttribute(
      'data-layout-state',
      'settled',
    );
    await expect(handle.current?.whenSettled()).resolves.toBe('settled');
    expect(handle.current?.layoutStats()).toBeNull();
  });
});
