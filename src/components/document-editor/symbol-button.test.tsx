import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { createEditorContext } from './editor-context.js';
import { DEFAULT_EDITOR_LABELS } from './editor-labels.js';
import { SymbolButton } from './symbol-button.js';

const contextOf = (editable: boolean) =>
  createEditorContext(null, EditorState.create({ schema: documentSchema }), {
    editable,
    labels: DEFAULT_EDITOR_LABELS,
  });

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
});
