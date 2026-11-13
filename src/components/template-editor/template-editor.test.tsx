import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { StoredContent, TemplateFile } from '../../model/index.js';
import { SettingControl } from './setting-controls.js';
import { TEMPLATE_SECTIONS } from './settings-catalog.js';
import { TemplateEditor, withRegionChange } from './template-editor.js';
import { TemplateJsonEditor } from './template-json-editor.js';
import { withListedSections } from './template-scope.js';
import { type TemplateSetting, withSetting } from './template-settings.js';

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

  it('DOCE-TEMPLATE-EDITOR-1.4 writes into the own region of a section the template inherits', () => {
    const template: TemplateFile = { formatVersion: 1, id: 'child', parent: 'house' };
    const resolved: TemplateFile = {
      ...template,
      sections: [{ name: 'cover' }, { name: 'annex', header: { content: [] } }],
    };
    const next = withRegionChange(template, change, resolved);
    expect(next.header).toBeUndefined();
    expect(next.sections).toEqual([
      { name: 'cover' },
      { name: 'annex', header: { content: CONTENT } },
    ]);
  });
});

describe('TemplateJsonEditor', () => {
  it('DOCE-TEMPLATE-EDITOR-1.5 shows the errors of a template that is JSON, not that it is not', async () => {
    const user = userEvent.setup();
    const changes: TemplateFile[] = [];
    const validity: (readonly string[])[] = [];
    render(
      <TemplateJsonEditor
        template={{ formatVersion: 1, id: 'plain' }}
        onChange={(next) => changes.push(next)}
        onValidityChange={(errors) => validity.push(errors)}
      />,
    );
    const text = screen.getByRole('textbox');
    await user.clear(text);
    await user.paste('{"formatVersion":1,"id":"plain","constructor":{"size":"A4"}}');
    expect(validity.at(-1)).toEqual(['template.constructor is not a template setting']);
    await user.clear(text);
    await user.paste('{"formatVersion":1,');
    expect(validity.at(-1)).toEqual(['The text is not valid JSON.']);
    expect(changes).toEqual([]);
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
    const [reset] = screen.getAllByRole('button', { name: 'Reset to inherited value' });
    if (!reset) throw new Error('No reset button');
    await user.click(reset);
    expect(changes.at(-1)).not.toHaveProperty('page');
    // The whole editor renders here, which takes over 5 s on a shared CI runner.
  }, 15_000);

  it('DOCE-TEMPLATE-EDITOR-1.3 adds a section after the sections the template inherits', async () => {
    const user = userEvent.setup();
    const changes: TemplateFile[] = [];
    const template: TemplateFile = { formatVersion: 1, id: 'child', parent: 'house' };
    const inherited = [
      { name: 'cover', required: true, editable: false },
      { name: 'body', label: 'Body' },
    ];
    render(
      <TemplateEditor
        template={template}
        resolved={{ ...template, sections: inherited }}
        onChange={(next) => changes.push(next)}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Add a section' }));
    // A list replaces the parent's whole, so the template takes the inherited sections with it.
    expect(changes.at(-1)?.sections).toEqual([...inherited, { name: 'section_3' }]);
  }, 15_000);
});

describe('withListedSections', () => {
  const inherited = [{ name: 'cover', required: true }, { name: 'body' }];
  const resolved: TemplateFile = { formatVersion: 1, id: 'child', sections: inherited };

  it('DOCE-TEMPLATE-EDITOR-1.3 lists the inherited sections while the template has no list', () => {
    const template: TemplateFile = { formatVersion: 1, id: 'child', parent: 'house' };
    expect(withListedSections(template, resolved).sections).toEqual(inherited);
    expect(withListedSections(template, undefined)).toBe(template);
  });

  it('DOCE-TEMPLATE-EDITOR-1.3 lists the template’s own sections, even none', () => {
    const own: TemplateFile = { formatVersion: 1, id: 'child', sections: [] };
    expect(withListedSections(own, resolved)).toBe(own);
  });

  it('DOCE-TEMPLATE-EDITOR-1.7 shows a size in a relative unit as written', () => {
    const size: TemplateSetting = {
      id: 'size',
      path: ['size'],
      label: 'Size',
      kind: { type: 'points' },
    };
    render(
      <SettingControl
        setting={size}
        value="1.5em"
        inherited="12pt"
        onChange={() => undefined}
        inheritedLabel={(value) => `Inherited: ${value}`}
      />,
    );
    expect(screen.getByRole('textbox', { name: 'Size' })).toHaveValue('1.5em');
  });
});
