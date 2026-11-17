import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { openSections } from '../../../test/property-sections.js';
import { resolveFontStack, type TemplateFile } from '../../model/index.js';
import { TemplateEditor } from './template-editor.js';

const SLOW = 20_000;
const PLAIN: TemplateFile = { formatVersion: 1, id: 'plain', sections: [{ name: 'annex' }] };

// An editor holding the template it is given, keeping each one it hands back.
function Host({ scope, written }: { scope?: string; written: TemplateFile[] }) {
  const [template, setTemplate] = useState(PLAIN);
  return (
    <TemplateEditor
      template={template}
      resolved={template}
      defaultScope={scope}
      onChange={(next) => {
        written.push(next);
        setTemplate(next);
      }}
    />
  );
}

// The labels of a section's rows, in order.
const rowLabels = (title: string) => {
  const heading = screen.getByRole('heading', { name: new RegExp(`^${title}`) });
  const section = heading.closest('.ui-property-section');
  if (!(section instanceof HTMLElement)) throw new Error(`No ${title} section.`);
  return [...section.querySelectorAll('.ui-property-row__label')].map((label) =>
    label.textContent?.trim(),
  );
};

describe('the template editor’s layout rows', () => {
  it(
    'DOCE-TEMPLATE-EDITOR-1.9 puts a list’s numbering first, labelled above, and its spacing on one row',
    async () => {
      const user = userEvent.setup();
      const written: TemplateFile[] = [];
      render(<Host written={written} />);
      await openSections(user, 'Lists');
      expect(rowLabels('Lists')).toEqual(['Numbering format', 'Bullet', 'Indentation', 'Spacing']);
      await user.type(screen.getByRole('textbox', { name: 'Space after' }), '4pt{Enter}');
      expect(written.at(-1)?.styles?.list).toEqual({ spaceAfter: '4pt' });
      const numbering = screen.getByRole('combobox', { name: 'Numbering format' });
      expect(numbering.closest('.ui-property-strip')).toHaveTextContent(/Before.*Format.*After/);
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-1.9 shows each change bar’s switch beside its colour, and the side as a list',
    async () => {
      const user = userEvent.setup();
      const written: TemplateFile[] = [];
      render(<Host written={written} />);
      await openSections(user, 'Change bars');
      expect(rowLabels('Change bars')).toEqual([
        'Insertions',
        'Deletions',
        'Modifications',
        'Formatting',
        'Side',
        'Offset',
        'Width',
      ]);
      const toggle = screen.getByRole('switch', { name: 'Show insertions' });
      const colour = screen.getByRole('textbox', { name: 'Insertions color' });
      expect(toggle.closest('.ui-property-row')).toBe(colour.closest('.ui-property-row'));
      await user.click(screen.getByRole('button', { name: /Side$/ }));
      await user.click(screen.getByRole('option', { name: 'Right' }));
      expect(written.at(-1)?.changeBars).toEqual({ side: 'right' });
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-1.9 groups the size and orientation under Paper, or Page in a section',
    async () => {
      const user = userEvent.setup();
      const { unmount } = render(<Host written={[]} />);
      await openSections(user, 'Page setup');
      const paper = screen.getByRole('group', { name: 'Paper' });
      expect(within(paper).getByText('Page size')).toBeInTheDocument();
      expect(within(paper).getByText('Orientation')).toBeInTheDocument();
      expect(screen.getByText("Use the parent's header")).toBeInTheDocument();
      unmount();
      render(<Host scope="annex" written={[]} />);
      await openSections(user, 'Page setup');
      expect(screen.getByRole('group', { name: 'Page' })).toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Paper' })).not.toBeInTheDocument();
      expect(screen.getByText("Use the document's header")).toBeInTheDocument();
      expect(screen.getByText("Use the document's footer")).toBeInTheDocument();
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-1.9 shows a table caption’s label and text fonts under their headings, and its placement as a list',
    async () => {
      const user = userEvent.setup();
      const written: TemplateFile[] = [];
      render(<Host written={written} />);
      await openSections(user, 'Tables');
      const tables = screen
        .getByRole('heading', { name: /^Tables/ })
        .closest('.ui-property-section');
      if (!(tables instanceof HTMLElement)) throw new Error('No tables section.');
      const label = within(tables).getByRole('group', { name: 'Caption label' });
      await user.type(within(label).getByRole('textbox', { name: 'Size' }), '8{Enter}');
      expect(written.at(-1)?.styles?.table).toEqual({ caption: { label: { size: '8pt' } } });
      expect(within(tables).getByRole('group', { name: 'Caption text' })).toBeInTheDocument();
      await user.click(within(tables).getByRole('button', { name: /^Caption\b/ }));
      await user.click(within(tables).getByRole('button', { name: /Placement$/ }));
      await user.click(screen.getByRole('option', { name: 'Below' }));
      expect(written.at(-1)?.styles?.table?.caption?.placement).toBe('below');
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-1.1 keeps a size of any non-negative decimal',
    async () => {
      const user = userEvent.setup();
      const written: TemplateFile[] = [];
      render(<Host written={written} />);
      await openSections(user, 'Text styles');
      const [paragraph] = screen.getAllByRole('button', { name: /^Paragraph\b/ });
      if (paragraph) await user.click(paragraph);
      const size = screen.getByRole('textbox', { name: 'Size' });
      await user.type(size, '10.25{Enter}');
      expect(written.at(-1)?.styles?.paragraph?.size).toBe('10.25pt');
      await user.clear(size);
      await user.type(size, '500{Enter}');
      expect(written.at(-1)?.styles?.paragraph?.size).toBe('500pt');
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-1.7 DOCE-TEMPLATES-1.2 offers a font the host serves, keeps its name and draws it with the host’s stack',
    async () => {
      const user = userEvent.setup();
      const written: TemplateFile[] = [];
      render(
        <TemplateEditor
          template={PLAIN}
          fonts={['Titillium Web', 'Arial']}
          onChange={(next) => written.push(next)}
        />,
      );
      await openSections(user, 'Text styles');
      const [paragraph] = screen.getAllByRole('button', { name: /^Paragraph\b/ });
      if (paragraph) await user.click(paragraph);
      const card = paragraph?.closest('.ui-property-card');
      if (!(card instanceof HTMLElement)) throw new Error('No paragraph card.');
      await user.click(within(card).getByRole('button', { name: /Font$/ }));
      await user.click(screen.getByRole('option', { name: 'Titillium Web' }));
      expect(written.at(-1)?.styles?.paragraph?.font).toBe('Titillium Web');
      const stack = '"Titillium Web", Arial, Helvetica, sans-serif';
      expect(resolveFontStack('Titillium Web', '', { 'Titillium Web': stack })).toBe(stack);
    },
    SLOW,
  );
});
