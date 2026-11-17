import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { openSections } from '../../../test/property-sections.js';
import type { TemplateFile } from '../../model/index.js';
import { withAllLevels } from './contents-catalog.js';
import { TemplateEditor } from './template-editor.js';

// The whole editor renders in each test, which takes seconds on a shared CI runner.
const SLOW = 45_000;

// The editor beside a host that holds the template, recording each change.
function Host({ log }: { log: TemplateFile[] }) {
  const [template, setTemplate] = useState<TemplateFile>({ formatVersion: 1, id: 'plain' });
  return (
    <TemplateEditor
      template={template}
      onChange={(next) => {
        log.push(next);
        setTemplate(next);
      }}
    />
  );
}

async function pick(user: ReturnType<typeof userEvent.setup>, field: string, option: string) {
  await user.click(screen.getByRole('button', { name: new RegExp(field) }));
  await user.click(await screen.findByRole('option', { name: option }));
}

describe('the contents section', () => {
  it(
    'DOCE-TEMPLATE-EDITOR-1.12 edits one kind of list over every list, and a heading level',
    async () => {
      const user = userEvent.setup();
      const log: TemplateFile[] = [];
      render(<Host log={log} />);
      await openSections(user, 'Contents');
      expect(screen.queryByRole('textbox', { name: 'Custom title' })).not.toBeInTheDocument();
      await pick(user, 'List type', 'List of figures');
      // A list without heading levels has no level picker.
      expect(screen.queryByRole('button', { name: /Heading level/ })).not.toBeInTheDocument();
      await user.type(screen.getByRole('textbox', { name: 'Custom title' }), 'Figures');
      await user.tab();
      expect(log.at(-1)?.styles?.contents?.kinds?.figures?.customTitle).toBe('Figures');

      await pick(user, 'List type', 'Table of contents');
      await pick(user, 'Heading level', 'Heading 3');
      expect(screen.getByText('Heading 3 leader')).toBeInTheDocument();
      // The level's card, after the text style of the same name.
      const cards = screen
        .getAllByRole('button', { name: /^Heading 3\b(?! leader)/ })
        .filter((button) => button.hasAttribute('aria-expanded'));
      await user.click(cards.at(-1) ?? document.body);
      await user.type(screen.getByRole('textbox', { name: 'Size' }), '13');
      await user.tab();
      const toc = log.at(-1)?.styles?.contents?.kinds?.toc;
      expect(toc?.levels).toEqual([null, null, { size: '13pt' }]);
      // The other kind keeps its settings.
      expect(log.at(-1)?.styles?.contents?.kinds?.figures?.customTitle).toBe('Figures');
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-1.12 sets every level’s indentation one step past the one above',
    async () => {
      const user = userEvent.setup();
      const log: TemplateFile[] = [];
      render(<Host log={log} />);
      await openSections(user, 'Contents');
      await user.click(screen.getByRole('button', { name: /^All levels/ }));
      await user.type(screen.getByRole('textbox', { name: 'Indent each level' }), '10');
      await user.tab();
      expect(log.at(-1)?.styles?.contents?.levels?.map((level) => level?.indentation)).toEqual([
        '0pt',
        '10pt',
        '20pt',
        '30pt',
        '40pt',
        '50pt',
      ]);
    },
    SLOW,
  );
});

describe('withAllLevels', () => {
  it('DOCE-TEMPLATE-EDITOR-1.12 keeps what each level sets beside what it changes', () => {
    const levels = withAllLevels([null, { size: '12pt', spaceBefore: '1pt' }], { before: 4 });
    expect(levels).toHaveLength(6);
    expect(levels[1]).toEqual({ size: '12pt', spaceBefore: '4pt' });
    expect(levels[0]).toEqual({ spaceBefore: '4pt' });
  });
});
