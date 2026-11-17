import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { NUMBERING_PRESETS, numberingExample } from './numbering-presets.js';
import { SettingControl } from './setting-controls.js';
import { numberingSetting } from './template-settings.js';

// A format field holding what it is given, as a template editor does.
function FormatField({ changes }: { changes: unknown[] }) {
  const [value, setValue] = useState<unknown>(undefined);
  return (
    <SettingControl
      setting={numberingSetting('format', 'Format')}
      value={value}
      inherited="1."
      onChange={(next) => {
        changes.push(next);
        setValue(next);
      }}
      inheritedLabel={(text) => `Inherited: ${text}`}
    />
  );
}

describe('numbering formats', () => {
  it('DOCE-TEMPLATE-EDITOR-1.7 shows each format by the numbers it gives, Roman ones too', () => {
    expect(numberingExample('I.')).toBe('I., II., III.');
    expect(numberingExample('i)')).toBe('i), ii), iii)');
    expect(numberingExample('I.1.i')).toBe('I.1.i, I.1.ii, I.1.iii');
    expect(numberingExample('A.1.')).toBe('A.1., A.2., A.3.');
    expect(NUMBERING_PRESETS).toEqual(expect.arrayContaining(['i.', 'I.', 'I.1.i']));
  });

  it('DOCE-TEMPLATE-EDITOR-1.7 picks a format from those offered, or keeps a typed one', async () => {
    const user = userEvent.setup();
    const changes: unknown[] = [];
    render(<FormatField changes={changes} />);
    const field = screen.getByRole('combobox', { name: 'Format' });
    expect(field).toHaveAttribute('placeholder', '1.');
    await user.click(field);
    await user.click(await screen.findByRole('option', { name: /I\., II\., III\./ }));
    expect(changes.at(-1)).toBe('I.');
    await user.clear(field);
    await user.type(field, 'Ab.1x');
    // A format keeps only what numbers, and a typed one waits for Enter.
    expect(field).toHaveValue('A.1');
    expect(changes.at(-1)).toBe('I.');
    await user.keyboard('{Enter}');
    expect(changes.at(-1)).toBe('A.1');
  });

  it('DOCE-TEMPLATE-EDITOR-1.7 keeps the separators . - ) _ and the space, and nothing else', async () => {
    const user = userEvent.setup();
    const changes: unknown[] = [];
    render(<FormatField changes={changes} />);
    const field = screen.getByRole('combobox', { name: 'Format' });
    await user.type(field, '1:a/A_i I)1-1.');
    expect(field).toHaveValue('1aA_i I)1-1.');
    await user.tab();
    expect(changes.at(-1)).toBe('1aA_i I)1-1.');
  });
});
