import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { TemplateFile } from '../../model/index.js';
import { TemplateEditor } from './template-editor.js';

const SLOW = 20_000;

// An editor holding the template it is given, as a host does, keeping each one it hands back.
function Host({
  start,
  written,
  isNew,
}: {
  start: TemplateFile;
  written: TemplateFile[];
  isNew?: boolean;
}) {
  const [template, setTemplate] = useState(start);
  return (
    <TemplateEditor
      template={template}
      isNew={isNew}
      labels={{ defaultName: 'Untitled', namePlaceholder: 'Name it' }}
      onChange={(next) => {
        written.push(next);
        setTemplate(next);
      }}
    />
  );
}

describe('the name', () => {
  it(
    'DOCE-TEMPLATE-EDITOR-2.6 is a draft until Enter, put back by Escape, and empty only while edited',
    async () => {
      const user = userEvent.setup();
      const written: TemplateFile[] = [];
      render(<Host start={{ formatVersion: 1, id: 'memo', name: 'Memo' }} written={written} />);
      const name = screen.getByRole('textbox', { name: 'Name' });
      await user.clear(name);
      // Empty while it is edited, with the host's placeholder.
      expect(name).toHaveAttribute('placeholder', 'Name it');
      await user.type(name, 'Letter');
      expect(written).toEqual([]);
      await user.keyboard('{Escape}');
      expect(name).toHaveValue('Memo');
      await user.clear(name);
      await user.type(name, 'Letter{Enter}');
      expect(written.at(-1)?.name).toBe('Letter');
      // An emptied name commits the default, the host's own text.
      await user.clear(name);
      await user.tab();
      expect(written.at(-1)?.name).toBe('Untitled');
      expect(name).toHaveValue('Untitled');
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-2.6 refuses characters a name may not hold, saying what it may',
    async () => {
      const user = userEvent.setup();
      const written: TemplateFile[] = [];
      render(<Host start={{ formatVersion: 1, id: 'memo', name: 'Memo' }} written={written} />);
      const name = screen.getByRole('textbox', { name: 'Name' });
      await user.clear(name);
      await user.paste('Re​port\u0007');
      expect(name).toHaveValue('Report');
      expect(name).toHaveAccessibleDescription('A name holds up to 120 visible characters.');
      await user.clear(name);
      await user.paste('x'.repeat(130));
      expect(name).toHaveValue('x'.repeat(120));
      await user.keyboard('{Enter}');
      expect(written.at(-1)?.name).toHaveLength(120);
    },
    SLOW,
  );
});

describe('the id', () => {
  it(
    'DOCE-TEMPLATE-EDITOR-2.6 says what an id is written with, may stay empty, and is put back by Escape',
    async () => {
      const user = userEvent.setup();
      const written: TemplateFile[] = [];
      render(<Host start={{ formatVersion: 1, id: 'memo' }} written={written} isNew />);
      const id = screen.getByRole('textbox', { name: 'Id' });
      expect(id).toHaveAttribute('placeholder', 'Type an id');
      await user.type(id, '-x');
      expect(id).toHaveAccessibleDescription(
        'An id starts with a letter, then letters, digits and _; other characters become _.',
      );
      await user.keyboard('{Escape}');
      expect(id).toHaveValue('memo');
      // Emptied, it commits quietly: the host asks for one when it saves.
      await user.clear(id);
      await user.tab();
      expect(written.at(-1)?.id).toBe('');
      expect(id).not.toHaveAccessibleDescription(/needs a letter/);
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-2.6 shows a saved template’s id, read-only',
    () => {
      render(<Host start={{ formatVersion: 1, id: 'memo' }} written={[]} />);
      const id = screen.getByRole('textbox', { name: 'Id' });
      expect(id).toHaveValue('memo');
      expect(id).toHaveAttribute('readonly');
    },
    SLOW,
  );
});
