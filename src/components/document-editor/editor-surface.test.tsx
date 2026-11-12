import { render, screen, waitFor } from '@testing-library/react';
import { EditorState } from 'prosemirror-state';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { createDocumentEditing } from '../../engine/index.js';
import { readDocumentFile, type TemplateFile } from '../../model/index.js';
import { DocumentEditor, type DocumentEditorProps } from './document-editor.js';
import { OVERVIEW_LAYERS, overviewLayers } from './editor-overview.js';

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
    ).doc,
    plugins: createDocumentEditing(documentSchema),
  });

function Harness(props: Partial<DocumentEditorProps>) {
  const [state, setState] = useState(initial);
  return (
    <DocumentEditor
      state={state}
      onStateChange={setState}
      template={TEMPLATE}
      aria-label="Report"
      {...props}
    />
  );
}

installEditorDom();

describe('EditorSurface', () => {
  it('DOCE-EDITOR-4.18 shows the lead before the document, and the placeholder until the pages are laid out', async () => {
    const { container } = render(
      <Harness
        scrollable
        lead={<h1>Quarterly report</h1>}
        placeholder={<span>Laying out pages</span>}
      />,
    );
    const lead = container.querySelector('.de-document-editor__viewport .de-document-editor__lead');
    expect(lead).toHaveTextContent('Quarterly report');
    const placeholder = screen.getByText('Laying out pages').parentElement;
    expect(placeholder).toHaveAttribute('role', 'status');
    expect(placeholder).toHaveClass('de-document-editor__placeholder');
    expect(placeholder).toHaveAttribute('aria-busy', 'true');
    expect(placeholder?.nextElementSibling).toHaveClass('de-document-editor__body');
    await waitFor(() => expect(screen.queryByText('Laying out pages')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Quarterly report' })).toBeInTheDocument();
  });

  it('DOCE-EDITOR-4.18 shows no placeholder in the web layout', () => {
    render(<Harness layout="web" placeholder={<span>Laying out pages</span>} />);
    expect(screen.queryByText('Laying out pages')).not.toBeInTheDocument();
  });

  it('DOCE-EDITOR-4.19 shows the overview beside the frame only while the editor scrolls', () => {
    const { container, rerender } = render(<Harness layout="web" scrollable overview />);
    expect(container.querySelector('.de-document-editor__overview')).toBeInTheDocument();
    rerender(<Harness layout="web" overview />);
    expect(container.querySelector('.de-document-editor__overview')).not.toBeInTheDocument();
  });

  it('DOCE-EDITOR-4.19 marks the matches, issues, changes and unread elements in their layers', () => {
    const dom = document.createElement('div');
    dom.innerHTML = [
      '<p data-id="a">One <span data-search-match="true">match</span></p>',
      '<p data-id="b">Two <span data-proofing-issue="i1">teh</span> <ins data-id="s1">new</ins></p>',
      '<p data-id="c">Three <del data-id="s2">old</del></p>',
    ].join('');
    const layers = overviewLayers(dom, { unread: ['c', 's2'] });
    expect(layers.map((layer) => layer.name)).toEqual([...OVERVIEW_LAYERS]);
    const marked = layers.map((layer) =>
      layer.markers.map((marker) => ('element' in marker ? marker.element.textContent : null)),
    );
    expect(marked).toEqual([['match'], ['teh'], ['new', 'old'], ['Three old']]);
    expect(layers[0]?.markers[0]).toMatchObject({
      color: 'var(--de-overview-search)',
      priority: 0,
    });
    expect(overviewLayers(dom, {})[3]?.markers).toEqual([]);
  });
});
