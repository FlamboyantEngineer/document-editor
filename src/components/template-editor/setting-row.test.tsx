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
  it('DOCE-TEMPLATE-EDITOR-1.13 keeps typed text a draft until Enter, and Escape puts the value back', async () => {
    const user = userEvent.setup();
    const changes: unknown[] = [];
    render(<Row start="Fig. " changes={changes} />);
    const field = screen.getByRole('textbox', { name: 'Before the number' });
    await user.clear(field);
    await user.type(field, 'Table');
    expect(changes).toEqual([]);
    await user.keyboard('{Escape}');
    expect(field).toHaveValue('Fig. ');
    await user.type(field, 's');
    await user.keyboard('{Enter}');
    expect(changes).toEqual(['Fig. s']);
  });

  it('DOCE-TEMPLATE-EDITOR-1.13 commits a draft once focus leaves the field', async () => {
    const user = userEvent.setup();
    const changes: unknown[] = [];
    render(<Row start={undefined} changes={changes} />);
    await user.type(screen.getByRole('textbox', { name: 'Before the number' }), 'Item ');
    expect(changes).toEqual([]);
    await user.tab();
    expect(changes).toEqual(['Item ']);
  });

  it('DOCE-TEMPLATE-EDITOR-1.1 inherits again once the field is emptied', async () => {
    const user = userEvent.setup();
    const changes: unknown[] = [];
    render(<Row start="Fig. " changes={changes} />);
    const field = screen.getByRole('textbox', { name: 'Before the number' });
    await user.clear(field);
    await user.tab();
    expect(changes).toEqual([null]);
    // The field shows the inherited value again.
    expect(field).toHaveValue('');
    expect(field).toHaveAttribute('placeholder', 'Table ');
  });

  it('DOCE-TEMPLATE-EDITOR-1.1 inherits again from the field’s menu, with no reset button on the row', async () => {
    const user = userEvent.setup();
    const changes: unknown[] = [];
    render(<Row start="Fig. " changes={changes} />);
    expect(
      screen.queryByRole('button', { name: 'Reset to inherited value' }),
    ).not.toBeInTheDocument();
    const field = screen.getByRole('textbox', { name: 'Before the number' });
    await user.pointer({ keys: '[MouseRight]', target: field });
    await user.click(await screen.findByRole('menuitem', { name: 'Reset to inherited value' }));
    expect(changes).toEqual([null]);
  });

  it('DOCE-TEMPLATE-EDITOR-1.13 marks an inheriting setting and says on hover where it comes from', async () => {
    const user = userEvent.setup();
    const changes: unknown[] = [];
    const { container } = render(<Row start={undefined} changes={changes} />);
    const row = container.querySelector('.ui-property-row');
    expect(row).toHaveAttribute('data-inherited', 'true');
    const setting = container.querySelector('.de-template-editor__setting');
    expect(setting).toHaveAttribute('data-inherited', 'true');
    expect(setting).toHaveAttribute(
      'title',
      'Inherited from the parent. Set a value to override it.',
    );
    await user.type(screen.getByRole('textbox', { name: 'Before the number' }), 'A');
    await user.tab();
    expect(row).not.toHaveAttribute('data-inherited');
    expect(setting).not.toHaveAttribute('title');
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
