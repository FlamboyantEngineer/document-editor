import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { TemplateFile } from '../../model/index.js';
import { TemplateEditor } from './template-editor.js';

const LETTER: TemplateFile = {
  formatVersion: 1,
  id: 'letter',
  page: { size: 'US Letter', margins: { top: '0.125in', right: '25.4mm' } },
};

describe('the margins', () => {
  it('DOCE-TEMPLATE-EDITOR-1.13 show every digit a margin holds and keep a typed fraction', async () => {
    const user = userEvent.setup();
    const changes: TemplateFile[] = [];
    render(<TemplateEditor template={LETTER} onChange={(next) => changes.push(next)} />);
    const top = screen.getByRole('textbox', { name: 'Top margin' });
    expect(top).toHaveValue('0.125');
    expect(screen.getByRole('textbox', { name: 'Right margin' })).toHaveValue('1');
    await user.clear(top);
    await user.type(top, '0.0625');
    expect(changes).toEqual([]);
    await user.keyboard('{Enter}');
    expect(changes.at(-1)?.page?.margins?.top).toBe('0.0625in');
  }, 15_000);

  it('DOCE-TEMPLATE-EDITOR-1.13 say why a typed margin is not a number and hold it from the template', async () => {
    const user = userEvent.setup();
    const changes: TemplateFile[] = [];
    const validity: string[] = [];
    render(
      <TemplateEditor
        template={LETTER}
        onChange={(next) => changes.push(next)}
        onDraftsChange={(state) => validity.push(state)}
      />,
    );
    const bottom = screen.getByRole('textbox', { name: 'Bottom margin' });
    await user.type(bottom, '-1');
    expect(bottom).toHaveAttribute('aria-invalid', 'true');
    expect(
      screen.getByText('Type a number that is zero or more, such as 0.125.'),
    ).toBeInTheDocument();
    await user.tab();
    expect(changes).toEqual([]);
    expect(validity).toEqual(['invalid']);
    await user.clear(bottom);
    expect(validity).toEqual(['invalid', 'clean']);
  }, 15_000);
});
