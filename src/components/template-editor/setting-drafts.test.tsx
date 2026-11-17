import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { SettingControl } from './setting-controls.js';
import { TemplateDrafts, useTemplateDraft, useTextDraft } from './setting-drafts.js';
import { setting, type SettingKind } from './template-settings.js';

// A field of a kind holding what it is given, as a template editor does, inside the drafts that
// tell whether every draft is valid.
function KindField({
  kind,
  start,
  inherited,
  changes,
  validity = [],
}: {
  kind: SettingKind;
  start?: unknown;
  inherited?: unknown;
  changes: unknown[];
  validity?: string[];
}) {
  const [value, setValue] = useState(start);
  return (
    <TemplateDrafts onDraftsChange={(state) => validity.push(state)}>
      <SettingControl
        setting={setting('value', 'Value', kind)}
        value={value}
        inherited={inherited}
        inheritedLabel={(text) => `Inherited: ${text}`}
        inheritedFrom="the parent"
        onChange={(next) => {
          changes.push(next);
          setValue(next);
        }}
      />
    </TemplateDrafts>
  );
}

describe('lengths', () => {
  it('DOCE-TEMPLATE-EDITOR-1.13 reads a number alone as pixels, on Enter', async () => {
    const user = userEvent.setup();
    const changes: unknown[] = [];
    render(<KindField kind={{ type: 'length' }} changes={changes} />);
    const field = screen.getByRole('textbox', { name: 'Value' });
    await user.type(field, '24');
    expect(changes).toEqual([]);
    await user.keyboard('{Enter}');
    expect(changes).toEqual(['24px']);
    await user.clear(field);
    await user.type(field, '0');
    await user.tab();
    // Zero is a value of its own.
    expect(changes.at(-1)).toBe('0px');
  });

  it('DOCE-TEMPLATE-EDITOR-1.13 says why a typed length is not one, never commits it, and reports it until reverted', async () => {
    const user = userEvent.setup();
    const changes: unknown[] = [];
    const validity: string[] = [];
    render(
      <KindField kind={{ type: 'length' }} start="6pt" changes={changes} validity={validity} />,
    );
    const field = screen.getByRole('textbox', { name: 'Value' });
    await user.clear(field);
    await user.type(field, '-3mm');
    expect(
      screen.getByText('Type a length such as 12pt or 6mm, or a number of pixels.'),
    ).toBeInTheDocument();
    expect(validity).toEqual(['pending', 'invalid']);
    await user.keyboard('{Enter}');
    await user.tab();
    expect(changes).toEqual([]);
    await user.click(field);
    await user.keyboard('{Escape}');
    expect(field).toHaveValue('6pt');
    expect(validity).toEqual(['pending', 'invalid', 'clean']);
  });
});

describe('numbers', () => {
  it('DOCE-TEMPLATE-EDITOR-1.13 keeps a size in points as typed, past hundredths and past 400', async () => {
    const user = userEvent.setup();
    const changes: unknown[] = [];
    render(<KindField kind={{ type: 'points' }} changes={changes} />);
    const field = screen.getByRole('textbox', { name: 'Value' });
    await user.type(field, '10.25');
    await user.tab();
    await user.clear(field);
    await user.type(field, '512');
    await user.tab();
    expect(changes).toEqual(['10.25pt', '512pt']);
  });

  it('DOCE-TEMPLATE-EDITOR-1.13 keeps a decimal as typed and takes no number below its least', async () => {
    const user = userEvent.setup();
    const changes: unknown[] = [];
    render(<KindField kind={{ type: 'number', min: 0 }} start={1.5} changes={changes} />);
    const field = screen.getByRole('textbox', { name: 'Value' });
    await user.clear(field);
    await user.type(field, '1.375');
    await user.tab();
    await user.clear(field);
    // The minus sign cannot be typed.
    await user.type(field, '-2');
    await user.tab();
    expect(changes).toEqual([1.375, 2]);
  });
});

describe('yes or no', () => {
  it('DOCE-TEMPLATE-EDITOR-1.13 is a switch captioned with what it inherits, then on, off and inherited again', async () => {
    const user = userEvent.setup();
    const changes: unknown[] = [];
    render(<KindField kind={{ type: 'boolean' }} inherited={true} changes={changes} />);
    const toggle = screen.getByRole('switch', { name: 'Value' });
    expect(screen.getByText('Inherited: On')).toBeInTheDocument();
    await user.click(toggle);
    await user.click(toggle);
    await user.click(toggle);
    expect(changes).toEqual([true, false, null]);
  });
});

// A host's own field that reports its draft.
function HostField({ isInvalid }: { isInvalid: boolean }) {
  useTemplateDraft(isInvalid ? 'invalid' : 'clean');
  return null;
}

describe('useTemplateDraft', () => {
  it('DOCE-TEMPLATE-EDITOR-1.13 tells the editor about a host field’s draft that is not valid, until it goes', () => {
    const validity: string[] = [];
    const drafts = (children: React.ReactNode) => (
      <TemplateDrafts onDraftsChange={(state) => validity.push(state)}>{children}</TemplateDrafts>
    );
    const { rerender } = render(drafts(<HostField isInvalid={false} />));
    rerender(drafts(<HostField isInvalid />));
    rerender(drafts(<HostField isInvalid={false} />));
    rerender(drafts(<HostField isInvalid />));
    rerender(drafts(null));
    expect(validity).toEqual(['invalid', 'clean', 'invalid', 'clean']);
  });
});

// A text draft over a value given from outside.
function DraftOf({ value }: { value: string }) {
  const [text, setText] = useTextDraft(value);
  return (
    <input aria-label="Draft" value={text} onChange={(event) => setText(event.target.value)} />
  );
}

describe('useTextDraft', () => {
  it('DOCE-TEMPLATE-EDITOR-1.13 drops a draft once the value changes, even back to the old one', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<DraftOf value="" />);
    await user.type(screen.getByRole('textbox', { name: 'Draft' }), '0');
    rerender(<DraftOf value="0" />);
    rerender(<DraftOf value="" />);
    expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('');
  });
});
