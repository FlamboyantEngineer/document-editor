import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { StoredContent, TemplateFile } from '../../model/index.js';
import { TemplateEditor, withRegionChange } from './template-editor.js';
import { TEMPLATE_SECTIONS, withSetting } from './template-settings.js';

const CONTENT: StoredContent = [{ type: 'paragraph', content: [{ type: 'text', text: 'Top' }] }];

describe('withSetting', () => {
  it('DOCE-TEMPLATE-EDITOR-1.1 keeps an empty string as the template’s own value', () => {
    const template: TemplateFile = { formatVersion: 1, id: 'plain' };
    const empty = withSetting(template, ['headings', 'prefix'], '');
    expect(empty).toMatchObject({ headings: { prefix: '' } });
    expect(withSetting(empty, ['headings', 'prefix'], null)).not.toHaveProperty('headings');
  });
});

describe('footnote numbering', () => {
  it('DOCE-TEMPLATE-EDITOR-1.3 is a setting of the document only', () => {
    const footnotes = TEMPLATE_SECTIONS.find((section) => section.scope[0] === 'footnotes');
    const numbering = footnotes?.settings.find((setting) => setting.id === 'numbering');
    expect(numbering?.documentOnly).toBe(true);
  });
});

describe('withRegionChange', () => {
  const change = { section: 'annex', region: 'header' as const, content: CONTENT };

  it('DOCE-TEMPLATE-EDITOR-1.4 writes into a section’s own region that does not inherit', () => {
    const template: TemplateFile = {
      formatVersion: 1,
      id: 'plain',
      sections: [{ name: 'annex', header: { inherit: false } }],
    } as TemplateFile;
    const next = withRegionChange(template, change);
    expect(next.sections?.[0]?.header?.content).toEqual(CONTENT);
    expect(next.header).toBeUndefined();
  });

  it('DOCE-TEMPLATE-EDITOR-1.4 writes into the document’s region while the section inherits it', () => {
    const template: TemplateFile = {
      formatVersion: 1,
      id: 'plain',
      sections: [{ name: 'annex', header: { inherit: true, content: [] } }],
    } as TemplateFile;
    const next = withRegionChange(template, change);
    expect(next.header?.content).toEqual(CONTENT);
    expect(next.sections?.[0]?.header?.content).toEqual([]);
  });
});

describe('TemplateEditor', () => {
  it('DOCE-TEMPLATE-EDITOR-1.1 offers to inherit again a value the template sets over its parent’s', async () => {
    const user = userEvent.setup();
    const changes: TemplateFile[] = [];
    const template: TemplateFile = { formatVersion: 1, id: 'plain', page: { size: 'A4' } };
    render(
      <TemplateEditor
        template={template}
        resolved={{ ...template, page: { size: 'A5' } }}
        onChange={(next) => changes.push(next)}
      />,
    );
    const [reset] = screen.getAllByRole('button', { name: 'Use the inherited value' });
    if (!reset) throw new Error('No reset button');
    await user.click(reset);
    expect(changes.at(-1)).not.toHaveProperty('page');
    // The whole editor renders here, which takes over 5 s on a shared CI runner.
  }, 15_000);
});
