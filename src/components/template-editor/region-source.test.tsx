import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { openSections } from '../../../test/property-sections.js';
import type { TemplateFile } from '../../model/index.js';
import { TemplateEditor } from './template-editor.js';

const SLOW = 20_000;
const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const TEMPLATE: TemplateFile = {
  formatVersion: 1,
  id: 'regions',
  header: { content: [paragraph('Interface notes')] },
  sections: [{ name: 'annex' }, { name: 'appendix', footer: { inherit: true } }],
};

// An editor holding the template it is given, keeping each one it hands back.
function Host({ scope, written }: { scope?: string; written: TemplateFile[] }) {
  const [template, setTemplate] = useState(TEMPLATE);
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

describe('the header’s and footer’s HTML source', () => {
  it(
    'DOCE-TEMPLATE-EDITOR-1.4 edits a header’s HTML in a dialog and keeps only what the schema knows',
    async () => {
      const user = userEvent.setup();
      const written: TemplateFile[] = [];
      render(<Host written={written} />);
      await openSections(user, 'Header & footer');
      await user.click(screen.getByRole('button', { name: 'Header HTML' }));
      const field = await screen.findByRole('textbox', { name: 'HTML' });
      expect(field).toHaveValue('<p>Interface notes</p>');
      await user.clear(field);
      await user.click(field);
      await user.paste('<p onclick="window.hit=1">Scope</p><script>window.hit=1</script>');
      await user.click(screen.getByRole('button', { name: 'Apply' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(written.at(-1)?.header?.content).toEqual([paragraph('Scope')]);
    },
    SLOW,
  );

  it(
    'DOCE-TEMPLATE-EDITOR-1.4 shows a section the header it inherits, and no source while it takes its parent’s',
    async () => {
      const user = userEvent.setup();
      const written: TemplateFile[] = [];
      const { unmount } = render(<Host scope="annex" written={written} />);
      await openSections(user, 'Header & footer');
      await user.click(screen.getByRole('button', { name: 'Header HTML' }));
      expect(await screen.findByRole('textbox', { name: 'HTML' })).toHaveValue(
        '<p>Interface notes</p>',
      );
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(written).toEqual([]);
      unmount();
      render(<Host scope="appendix" written={written} />);
      await openSections(user, 'Header & footer');
      expect(screen.getByRole('button', { name: 'Footer HTML' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Header HTML' })).toBeEnabled();
    },
    SLOW,
  );
});
