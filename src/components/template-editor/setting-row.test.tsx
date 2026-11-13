import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { SettingRow } from './setting-row.js';
import { setting } from './template-settings.js';

const PREFIX = setting('numbering.prefix', 'Before the number', { type: 'text' });

// A row holding its own value, which starts as given, over an inherited `Table `.
function Row({ start, changes }: { start: unknown; changes: unknown[] }) {
  const [value, setValue] = useState(start);
  return (
    <SettingRow
      setting={PREFIX}
      value={value}
      inherited="Table "
      inheritedLabel={(shown, source) => `Inherited from ${source ?? ''}: ${shown}`}
      inheritedFrom="the parent"
      onChange={(next) => {
        changes.push(next);
        setValue(next);
      }}
    />
  );
}

describe('SettingRow', () => {
  it('DOCE-TEMPLATE-EDITOR-1.1 keeps an emptied text as the template’s own empty value', async () => {
    const user = userEvent.setup();
    const changes: unknown[] = [];
    render(<Row start={undefined} changes={changes} />);
    const field = screen.getByRole('textbox', { name: 'Before the number' });
    expect(field).toHaveAttribute('placeholder', 'Table ');
    await user.type(field, 'T');
    await user.clear(field);
    expect(changes.at(-1)).toBe('');
    // The own empty value shows empty, not the inherited value it replaces.
    expect(field).toHaveValue('');
    expect(field).not.toHaveAttribute('placeholder');
  });

  it('DOCE-TEMPLATE-EDITOR-1.1 inherits again from an own empty value with the row’s reset', async () => {
    const user = userEvent.setup();
    const changes: unknown[] = [];
    render(<Row start="" changes={changes} />);
    await user.click(screen.getByRole('button', { name: 'Reset to inherited value' }));
    expect(changes).toEqual([null]);
    expect(screen.getByRole('textbox', { name: 'Before the number' })).toHaveAttribute(
      'placeholder',
      'Table ',
    );
    expect(
      screen.queryByRole('button', { name: 'Reset to inherited value' }),
    ).not.toBeInTheDocument();
  });

  it('DOCE-TEMPLATE-EDITOR-1.11 shows why a reference format is not valid', () => {
    const format = {
      ...setting('formats.internal-figure', 'Format', { type: 'text' }),
      check: (value: unknown) => (value === '{{bad}}' ? 'Use only known tokens.' : null),
    };
    render(
      <SettingRow
        setting={format}
        value="{{bad}}"
        inherited={undefined}
        inheritedLabel={(shown) => shown}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByText('Use only known tokens.')).toBeInTheDocument();
  });
});
