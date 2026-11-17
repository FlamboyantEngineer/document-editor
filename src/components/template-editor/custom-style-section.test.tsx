import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { openSections } from '../../../test/property-sections.js';
import type { TemplateFile } from '../../model/index.js';
import { TemplateEditor } from './template-editor.js';

const SLOW = 20_000;

// An editor holding the template it is given, keeping each one it hands back.
function Host({
  start,
  resolved,
  scope,
  written,
}: {
  start: TemplateFile;
  resolved?: TemplateFile;
  scope?: string;
  written: TemplateFile[];
}) {
  const [template, setTemplate] = useState(start);
  return (
    <TemplateEditor
      template={template}
      resolved={resolved}
      defaultScope={scope}
      onChange={(next) => {
        written.push(next);
        setTemplate(next);
      }}
    />
  );
}

describe('custom styles', () => {
  it(
    'DOCE-TEMPLATE-EDITOR-1.10 adds custom_style_1 with its defaults and no colour',
    async () => {
      const user = userEvent.setup();
      const written: TemplateFile[] = [];
      render(<Host start={{ formatVersion: 1, id: 'plain' }} written={written} />);
      await openSections(user, 'Custom styles');
      await user.click(screen.getByRole('button', { name: 'Add a style' }));
      expect(written.at(-1)?.styles?.custom).toEqual({
        custom_style_1: {
          font: 'Arial',
          size: '12pt',
          lineHeight: 1.5,
          spaceBefore: '6pt',
          spaceAfter: '6pt',
          alignment: 'left',
        },
      });
      await user.click(screen.getByRole('button', { name: 'Add a style' }));
      expect(Object.keys(written.at(-1)?.styles?.custom ?? {})).toEqual([
        'custom_style_1',
        'custom_style_2',
      ]);
      await user.click(screen.getByRole('button', { name: /^custom_style_1\b/ }));
      expect(screen.queryByRole('textbox', { name: 'Colour' })).not.toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Line height' })).toBeInTheDocument();
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-1.10 keeps an inherited style read-only until overridden, then field by field, and goes back to it',
    async () => {
      const user = userEvent.setup();
      const written: TemplateFile[] = [];
      const template: TemplateFile = {
        formatVersion: 1,
        id: 'plain',
        styles: { custom: { lead: { size: '13pt', font: 'Georgia' } } },
        sections: [{ name: 'annex' }],
      };
      render(<Host start={template} resolved={template} scope="annex" written={written} />);
      await openSections(user, 'Custom styles');
      await user.click(screen.getByRole('button', { name: /^lead\b.*inherited/ }));
      const size = screen.getByRole('textbox', { name: 'Size' });
      expect(size).toBeDisabled();
      expect(screen.queryByRole('button', { name: 'Delete the style' })).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Override the inherited style' }));
      await user.clear(size);
      await user.type(size, '9{Enter}');
      // Only the field set is the section's own: the font still comes from the document.
      expect(written.at(-1)?.sections?.[0]?.styles?.custom).toEqual({ lead: { size: '9pt' } });
      await user.click(screen.getByRole('button', { name: 'Use the inherited style' }));
      expect(written.at(-1)?.sections?.[0]?.styles).toBeUndefined();
    },
    SLOW,
  );
});

describe('text style rows', () => {
  it(
    'DOCE-TEMPLATE-EDITOR-1.1 shows a heading’s font, size and face on one row, its alignment with an inert justify, and no line height',
    async () => {
      const user = userEvent.setup();
      render(<Host start={{ formatVersion: 1, id: 'plain' }} written={[]} />);
      await openSections(user, 'Text styles');
      const [card] = screen.getAllByRole('button', { name: /^Heading 1\b/ });
      if (!card) throw new Error('No Heading 1 card');
      await user.click(card);
      const size = screen.getByRole('textbox', { name: 'Size' });
      const bold = screen.getByRole('button', { name: 'Bold' });
      expect(size.compareDocumentPosition(bold) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(screen.getByRole('radio', { name: 'Justify' })).toBeDisabled();
      expect(screen.queryByRole('textbox', { name: 'Line height' })).not.toBeInTheDocument();
      expect(screen.getAllByText('Before').length).toBeGreaterThan(0);
      expect(screen.getAllByText('After').length).toBeGreaterThan(0);
    },
    SLOW,
  );
});

describe('a section’s heading numbering', () => {
  it(
    'DOCE-TEMPLATE-EDITOR-1.3 sets each heading level’s numbering in one section, an emptied field inheriting again',
    async () => {
      const user = userEvent.setup();
      const written: TemplateFile[] = [];
      const template: TemplateFile = {
        formatVersion: 1,
        id: 'plain',
        sections: [{ name: 'annex' }],
      };
      render(<Host start={template} resolved={template} scope="annex" written={written} />);
      const section = screen.getByRole('button', { name: /^Heading numbering\b/ });
      if (section.getAttribute('aria-expanded') !== 'true') await user.click(section);
      const formats = screen.getAllByRole('combobox', { name: 'Numbering' });
      expect(formats).toHaveLength(6);
      const [first] = formats;
      if (!first) throw new Error('No format');
      await user.type(first, 'A.{Enter}');
      expect(written.at(-1)?.sections?.[0]?.styles?.heading1?.numbering).toEqual({ format: 'A.' });
      await user.clear(first);
      await user.tab();
      expect(written.at(-1)?.sections?.[0]?.styles).toBeUndefined();
    },
    SLOW,
  );
});
