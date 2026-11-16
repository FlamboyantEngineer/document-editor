import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState } from 'prosemirror-state';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { createDocumentEditing } from '../../engine/index.js';
import type { FontsAdapter } from '../../host/index.js';
import { readDocumentFile, type TemplateFile } from '../../model/index.js';
import { createLoadProgress } from '../../session/load-progress.js';
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
    expect(container.querySelector('.de-document-editor__body')).not.toHaveAttribute('inert');
    expect(screen.getByRole('heading', { name: 'Quarterly report' })).toBeInTheDocument();
  });

  it('DOCE-EDITOR-4.27 DOCE-SESSION-9.8 keeps the document busy and out of reach until its pages first settle, then makes the load ready', async () => {
    const loadProgress = createLoadProgress();
    const { container } = render(<Harness loadProgress={loadProgress} />);
    const body = container.querySelector('.de-document-editor__body');
    expect(body).toHaveAttribute('inert');
    expect(loadProgress.get().status).toBe('loading');
    expect(body).toHaveAttribute('aria-busy', 'true');
    // The load is made ready by an effect after the commit that frees the body, so both are awaited.
    await waitFor(() => {
      expect(body).not.toHaveAttribute('inert');
      expect(loadProgress.get()).toMatchObject({ status: 'ready', percent: 100 });
    });
    expect(body).not.toHaveAttribute('aria-busy');
    expect(container.firstElementChild).toHaveAttribute('data-layout-state', 'settled');
  });

  it('DOCE-EDITOR-4.29 DOCE-SESSION-9.8 shows no pages without the template fonts, failing the load', async () => {
    const loadProgress = createLoadProgress();
    const onLayoutFailed = vi.fn();
    const fonts: FontsAdapter = {
      load: () => Promise.resolve({ ok: true, value: [] }),
    };
    const { container } = render(
      <Harness
        template={{ ...TEMPLATE, styles: { paragraph: { font: 'Serif Pro' } } }}
        fonts={fonts}
        loadProgress={loadProgress}
        onLayoutFailed={onLayoutFailed}
      />,
    );
    const error = await screen.findByText('The document cannot be shown: Serif Pro did not load.');
    expect(error.closest('.de-document-editor__layout-error')).toBeInTheDocument();
    expect(container.querySelector('.de-document-editor__body')).toHaveAttribute('inert');
    // The host hears of it from an effect after the error shows, which may come a render later.
    await waitFor(() => expect(onLayoutFailed).toHaveBeenCalledOnce());
    expect(loadProgress.get().status).toBe('failed');
    expect(screen.queryByRole('region', { name: 'Document notices' })).not.toBeInTheDocument();
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

  it('DOCE-EDITOR-4.11 keeps the document and its focus while a panel comes and goes beside it', async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(<Harness layout="web" />);
    const shown = screen.getByRole('textbox', { name: 'Report' });
    await user.click(shown);
    expect(shown).toHaveFocus();
    const workspace = container.querySelector('.de-document-editor__workspace');
    expect(workspace).not.toHaveAttribute('data-panels');

    rerender(
      <Harness layout="web" panels={{ end: <aside aria-label="Details">Details</aside> }} />,
    );
    expect(screen.getByRole('complementary', { name: 'Details' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Report' })).toBe(shown);
    expect(shown).toHaveFocus();
    expect(workspace).toHaveAttribute('data-panels', 'true');
    expect(workspace?.lastElementChild).toHaveAccessibleName('Details');

    rerender(<Harness layout="web" />);
    expect(screen.getByRole('textbox', { name: 'Report' })).toBe(shown);
    expect(workspace).not.toHaveAttribute('data-panels');
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
