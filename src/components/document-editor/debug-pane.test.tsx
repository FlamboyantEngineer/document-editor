import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState } from 'prosemirror-state';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { TEST_FONTS } from '../../../test/served-fonts.js';
import { createDocumentEditing } from '../../engine/index.js';
import { readDocumentFile, type TemplateFile } from '../../model/index.js';
import { formatMarkup, tokenizeMarkup } from './debug-markup.js';
import { DocumentEditor, type DocumentEditorDebug } from './document-editor.js';
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
    ).doc,
    plugins: createDocumentEditing(documentSchema),
  });

function Harness({
  debug,
  onDebugChange,
  layout = 'page',
}: {
  debug: DocumentEditorDebug;
  onDebugChange?: (debug: DocumentEditorDebug) => void;
  layout?: DocumentLayout;
}) {
  const [state, setState] = useState(initial);
  return (
    <DocumentEditor
      state={state}
      onStateChange={setState}
      template={TEMPLATE}
      layout={layout}
      fonts={TEST_FONTS}
      aria-label="Report"
      debug={debug}
      onDebugChange={onDebugChange}
      panels={{ end: <aside aria-label="Details">Details</aside> }}
    />
  );
}

// A host that follows the debugging modes the shortcut hands it.
function Following({ onDebugChange }: { onDebugChange: (debug: DocumentEditorDebug) => void }) {
  const [debug, setDebug] = useState<DocumentEditorDebug>({});
  return (
    <Harness
      debug={debug}
      onDebugChange={(next) => {
        onDebugChange(next);
        setDebug(next);
      }}
    />
  );
}

installEditorDom();

const measure = (container: HTMLElement) => container.querySelector('.de-document-editor__measure');

describe('DebugPane', () => {
  it('DOCE-EDITOR-6.29 shows the measuring view beside the pages in place of the end panel', () => {
    const { container, rerender } = render(<Harness debug={{}} />);
    const measuring = measure(container);
    expect(screen.getByRole('complementary', { name: 'Details' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Layout debugging' })).not.toBeInTheDocument();
    rerender(<Harness debug={{ measure: true }} />);
    const pane = screen.getByRole('region', { name: 'Layout debugging' });
    expect(pane).toHaveClass('de-document-editor__debug');
    expect(pane).toHaveAttribute('data-view', 'measure');
    expect(pane).toHaveAttribute('style', expect.stringContaining('--de-debug-width: 480px'));
    expect(measure(container)).toBe(measuring);
    expect(pane).toContainElement(measuring as HTMLElement);
    expect(screen.getByRole('separator', { name: 'Resize the layout debugging' })).toBeVisible();
    expect(screen.queryByRole('complementary', { name: 'Details' })).not.toBeInTheDocument();
    rerender(<Harness debug={{}} />);
    expect(screen.getByRole('complementary', { name: 'Details' })).toBeInTheDocument();
    expect(
      screen.queryByRole('separator', { name: 'Resize the layout debugging' }),
    ).not.toBeInTheDocument();
    expect(measure(container)).toBe(measuring);
  });

  it('DOCE-EDITOR-6.29 resizes the pane by keyboard', async () => {
    const user = userEvent.setup();
    render(<Harness debug={{ measure: true }} />);
    const handle = screen.getByRole('separator', { name: 'Resize the layout debugging' });
    handle.focus();
    await user.keyboard('{ArrowLeft}');
    const pane = screen.getByRole('region', { name: 'Layout debugging' });
    expect(pane.getAttribute('style')).not.toContain('--de-debug-width: 480px');
  });

  it('DOCE-EDITOR-6.29 prints the pages markup, read-only and highlighted, in both layouts', async () => {
    const { rerender } = render(<Harness debug={{ source: true }} />);
    const pane = screen.getByRole('region', { name: 'Layout debugging' });
    expect(pane).toHaveAttribute('data-view', 'source');
    await waitFor(() => expect(within(pane).getByText(/Hello/)).toBeInTheDocument());
    expect(within(pane).queryByRole('textbox')).not.toBeInTheDocument();
    rerender(<Harness debug={{ source: true }} layout="web" />);
    expect(screen.getByRole('region', { name: 'Layout debugging' })).toBeInTheDocument();
    rerender(<Harness debug={{ measure: true }} layout="web" />);
    expect(screen.queryByRole('region', { name: 'Layout debugging' })).not.toBeInTheDocument();
  });

  it('DOCE-EDITOR-6.29 prints one element a line by depth, text escaped', () => {
    const element = document.createElement('div');
    element.innerHTML =
      '<p class="a" data-x="1 &quot;2&quot;">One &lt; two</p><hr><ul><li>Item</li></ul>';
    expect(formatMarkup(element)).toBe(
      [
        '<div>',
        '  <p class="a" data-x="1 &quot;2&quot;">One &lt; two</p>',
        '  <hr>',
        '  <ul>',
        '    <li>Item</li>',
        '  </ul>',
        '</div>',
      ].join('\n'),
    );
  });

  it('DOCE-EDITOR-6.29 highlights tag names, attribute names and values apart', () => {
    const source = '<p class="a">One</p>';
    const tokens = tokenizeMarkup(source);
    expect(tokens.map(({ text }) => text).join('')).toBe(source);
    expect(tokens.filter(({ type }) => type).map(({ text, type }) => `${type}:${text}`)).toEqual([
      'punctuation:<',
      'keyword:p',
      'key:class',
      'punctuation:=',
      'string:"a"',
      'punctuation:>',
      'punctuation:</',
      'keyword:p',
      'punctuation:>',
    ]);
  });

  it('DOCE-EDITOR-6.30 steps through the debugging modes with the shortcut', async () => {
    const user = userEvent.setup();
    const onDebugChange = vi.fn();
    render(<Following onDebugChange={onDebugChange} />);
    await user.click(screen.getByRole('textbox', { name: 'Report' }));
    for (let press = 0; press < 4; press += 1)
      await user.keyboard('{Control>}{Alt>}b{/Alt}{/Control}');
    expect(onDebugChange.mock.calls.map(([debug]) => debug as DocumentEditorDebug)).toEqual([
      { pages: true, blocks: true },
      { pages: true, blocks: true, measure: true },
      { source: true },
      {},
    ]);
  });

  it('DOCE-EDITOR-6.30 leaves the shortcut alone without onDebugChange', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness debug={{}} />);
    await user.click(screen.getByRole('textbox', { name: 'Report' }));
    await user.keyboard('{Control>}{Alt>}b{/Alt}{/Control}');
    expect(container.querySelector('.de-document-editor')).not.toHaveAttribute('data-debug');
    expect(screen.getByRole('textbox', { name: 'Report' })).toHaveTextContent('Hello');
  });

  it('DOCE-EDITOR-6.31 shows a hovered block its type, sizes and place', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness debug={{ blocks: true }} />);
    const block = await waitFor(() => {
      const found = container.querySelector<HTMLElement>('.pm-page-content > p[data-debug-type]');
      if (!found) throw new Error('no marked block');
      return found;
    });
    await user.hover(block);
    const tip = await screen.findByRole('tooltip');
    expect(tip).toHaveClass('de-document-editor__debug-tip');
    expect(tip).toHaveTextContent('paragraph');
    expect(tip).toHaveTextContent('0.000 × 0.000');
    expect(tip).toHaveTextContent('With margins');
    expect(tip).toHaveTextContent('At 0.000, 0.000');
    await user.hover(block.closest('.pm-page') as HTMLElement);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
