import { render, waitFor } from '@testing-library/react';
import { EditorState } from 'prosemirror-state';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { createContents, createDocumentEditing } from '../../engine/index.js';
import { BASE_TEMPLATE, readDocumentFile } from '../../model/index.js';
import { DocumentEditor } from './document-editor.js';

installEditorDom();

const doc = () =>
  readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [
            { type: 'contents' },
            { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Scope' }] },
          ],
        },
      ],
    },
    documentSchema,
  ).doc;

function Harness({ own }: { own: boolean }) {
  const [state, setState] = useState(() =>
    EditorState.create({
      doc: doc(),
      plugins: [
        ...createDocumentEditing(documentSchema),
        ...(own
          ? [createContents({ template: () => BASE_TEMPLATE, labels: { toc: { title: 'Own' } } })]
          : []),
      ],
    }),
  );
  return (
    <DocumentEditor
      state={state}
      onStateChange={setState}
      template={BASE_TEMPLATE}
      layout="web"
      contents={{ labels: { toc: { title: 'Outline' } } }}
    />
  );
}

describe('the lists of contents a document editor draws', () => {
  it('DOCE-CONTENTS-2.12 draws the lists of a document whose host installs none', async () => {
    const { container } = render(<Harness own={false} />);
    await waitFor(() => {
      expect(container.querySelector('.de-contents__title')).toHaveTextContent('Outline');
    });
    expect(container.querySelector('.de-contents__entry')).toHaveTextContent('Scope');
  });

  it('DOCE-CONTENTS-2.12 keeps the contents plugin a host installs', async () => {
    const { container } = render(<Harness own />);
    await waitFor(() => {
      expect(container.querySelector('.de-contents__title')).toHaveTextContent('Own');
    });
  });
});
