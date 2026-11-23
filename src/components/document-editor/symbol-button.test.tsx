import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { createEditorContext } from './editor-context.js';
import { DEFAULT_EDITOR_LABELS } from './editor-labels.js';
import { SymbolButton } from './symbol-button.js';

const OMEGA = { id: 'greek', label: 'Greek', characters: [{ char: 'Ω', name: 'Omega' }] };

const contextOf = (editable: boolean) =>
  createEditorContext(null, EditorState.create({ schema: documentSchema }), {
    editable,
    labels: DEFAULT_EDITOR_LABELS,
  });

installEditorDom();

describe('SymbolButton', () => {
  it('DOCE-EDITOR-4.14 stays focusable while the document is read, and says why it is disabled', async () => {
    const user = userEvent.setup();
    render(<SymbolButton context={contextOf(false)} symbols={[]} />);
    const button = screen.getByRole('button', { name: 'Symbol' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await user.tab();
    expect(button).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Symbol: The document is open for reading',
    );
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });

  it('DOCE-ENTRY-2.2 loads the character grid when the picker first opens, and focuses it', async () => {
    const user = userEvent.setup();
    const state = EditorState.create({
      doc: documentSchema.node('doc', null, [documentSchema.node('paragraph')]),
    });
    const view = new EditorView(document.createElement('div'), { state });
    const context = createEditorContext(view, state, {
      editable: true,
      labels: DEFAULT_EDITOR_LABELS,
    });
    render(<SymbolButton context={context} symbols={[OMEGA]} />);
    await user.click(screen.getByRole('button', { name: 'Symbol' }));
    expect(await screen.findByRole('grid', { name: 'Symbol' })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Symbol' })).toContainElement(
      document.activeElement as HTMLElement,
    );
  });

  it('DOCE-EDITOR-4.5 lays the characters out eight to a row', async () => {
    const user = userEvent.setup();
    const state = EditorState.create({
      doc: documentSchema.node('doc', null, [documentSchema.node('paragraph')]),
    });
    const view = new EditorView(document.createElement('div'), { state });
    const context = createEditorContext(view, state, {
      editable: true,
      labels: DEFAULT_EDITOR_LABELS,
    });
    render(<SymbolButton context={context} symbols={[OMEGA]} />);
    await user.click(screen.getByRole('button', { name: 'Symbol' }));
    await screen.findByRole('grid', { name: 'Symbol' });
    const rows = document.querySelectorAll<HTMLElement>('[style*="grid-template-columns"]');
    expect([...rows].map((row) => row.style.gridTemplateColumns)).toContain(
      'repeat(8, minmax(0px, 1fr))',
    );
  });
});
