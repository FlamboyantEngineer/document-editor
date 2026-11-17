import { render, screen } from '@testing-library/react';
import { EditorState } from 'prosemirror-state';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { createDocumentEditing, createProofing } from '../../engine/index.js';
import type { ProoferAdapter } from '../../host/index.js';
import { readDocumentFile, type TemplateFile } from '../../model/index.js';
import { DocumentEditor } from './document-editor.js';

const TEMPLATE: TemplateFile = { formatVersion: 1, id: 'article' };

const stateWith = (proofer: ProoferAdapter) =>
  EditorState.create({
    doc: readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A teh report' }] }],
          },
        ],
      },
      documentSchema,
    ).doc,
    plugins: [...createDocumentEditing(documentSchema), createProofing({ proofer, delay: 0 })],
  });

function Harness({ proofer, editable = true }: { proofer: ProoferAdapter; editable?: boolean }) {
  const [state, setState] = useState(() => stateWith(proofer));
  return (
    <DocumentEditor
      state={state}
      onStateChange={setState}
      template={TEMPLATE}
      layout="web"
      aria-label="Report"
      editable={editable}
      statusBar
    />
  );
}

const status = (container: HTMLElement) =>
  container.querySelector('.de-document-editor__proofing-status');

installEditorDom();

describe('proofing status', () => {
  it('DOCE-PROOFING-3.1 says checking while text waits, and unavailable without blocking', async () => {
    let fail: ((reason: Error) => void) | null = null;
    const proofer: ProoferAdapter = {
      check: () =>
        new Promise((_, reject) => {
          fail = reject;
        }),
    };
    const { container } = render(<Harness proofer={proofer} />);
    await vi.waitFor(() => expect(status(container)).toHaveTextContent('Checking…'));
    await vi.waitFor(() => expect(fail).not.toBeNull());
    (fail as ((reason: Error) => void) | null)?.(new Error('The checker is down.'));
    expect(await screen.findByText('Proofing unavailable')).toBeInTheDocument();
    expect(status(container)).toHaveAttribute('data-status', 'unavailable');
    // The document stays editable, and the browser's own spelling checker stays off.
    const root = container.querySelector('[contenteditable="true"]');
    expect(root).toHaveAttribute('spellcheck', 'false');
  });

  it('DOCE-PROOFING-1.8 shows no proofing status in a view the reader cannot edit', async () => {
    const proofer: ProoferAdapter = { check: (texts) => Promise.resolve(texts.map(() => [])) };
    const { container } = render(<Harness proofer={proofer} editable={false} />);
    await vi.waitFor(() =>
      expect(screen.getByRole('group', { name: 'Document status' })).toHaveTextContent('3 words'),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(status(container)).toBeNull();
  });
});
