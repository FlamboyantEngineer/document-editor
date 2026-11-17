import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { openSections } from '../../../test/property-sections.js';
import type { StoredContent, TemplateFile } from '../../model/index.js';
import { SettingControl } from './setting-controls.js';
import { TEMPLATE_SECTIONS } from './settings-catalog.js';
import { TemplateEditor, withRegionChange } from './template-editor.js';
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

describe('footnote rows', () => {
  it('DOCE-TEMPLATE-EDITOR-1.9 leave the numbering mode, the text after the number and the colours to the file', () => {
    const footnotes = TEMPLATE_SECTIONS.find((section) => section.scope[0] === 'footnotes');
    expect(footnotes?.settings.map((setting) => setting.id)).toEqual([
      'separator.enabled',
      'separator.thickness',
      'spacingToContent',
      'entrySpacing',
    ]);
    expect(footnotes?.cards?.map((card) => card.style)).toEqual([
      ['font', 'emphasis'],
      ['font', 'emphasis', 'justify', 'lineHeight'],
    ]);
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

describe('the package', () => {
  it('DOCE-TEMPLATE-EDITOR-1.5 DOCE-TEMPLATE-EDITOR-2.7 offers no JSON editor, these being withdrawn', async () => {
    const components = await import('../index.js');
    expect(Object.keys(components).filter((name) => /json/i.test(name))).toEqual([]);
  });
});

describe('TemplateEditor', () => {
  it('DOCE-TEMPLATE-EDITOR-1.9 starts with only the identity and the scope expanded', () => {
    render(<TemplateEditor template={{ formatVersion: 1, id: 'plain' }} onChange={() => {}} />);
    const expanded = screen
      .getAllByRole('heading')
      .map((heading) => within(heading).queryByRole('button', { expanded: true })?.textContent)
      .filter(Boolean)
      .map((title) => title?.replace(/[\s\d]+$/, ''));
    expect(expanded).toEqual(['Identity', 'Settings of']);
    expect(screen.getByRole('button', { name: /^Page setup/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

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
    await openSections(user);
    // The field's menu inherits again.
    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('button', { name: /Page size/ }),
    });
    await user.click(await screen.findByRole('menuitem', { name: 'Reset to inherited value' }));
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

  it('DOCE-TEMPLATE-EDITOR-1.9 keeps a zero region height and shows inherited paragraph numbering', async () => {
    const user = userEvent.setup();
    const changes: TemplateFile[] = [];
    const template: TemplateFile = { formatVersion: 1, id: 'child', parent: 'house' };
    const resolved: TemplateFile = {
      ...template,
      header: { height: '12mm' },
      styles: { paragraph: { numbering: { enabled: true, format: '1.' } } },
    };
    render(
      <TemplateEditor
        template={template}
        resolved={resolved}
        onChange={(next) => changes.push(next)}
      />,
    );
    await openSections(user);
    // The paragraph numbering the parent sets shows as inherited while the template sets none.
    const [format] = screen.getAllByRole('combobox', { name: 'Format' });
    expect(format).toHaveAttribute('placeholder', '1.');
    // A zero height is a value of the template's own, not an unset one.
    const height = screen.getByRole('textbox', { name: 'Header height' });
    await user.type(height, '0pt');
    await user.tab();
    expect(changes.at(-1)?.header).toEqual({ height: '0pt' });
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

describe('the references settings', () => {
  it('DOCE-TEMPLATE-EDITOR-1.11 sets the format, then the link, of each kind of reference, the host’s types included', async () => {
    const user = userEvent.setup();
    const changes: TemplateFile[] = [];
    render(
      <TemplateEditor
        template={{ formatVersion: 1, id: 'report' }}
        onChange={(next) => changes.push(next)}
        referenceTypes={[{ type: 'catalog', label: 'the catalog' }]}
      />,
    );
    await openSections(user);
    expect(
      screen.getByText(
        'Uses {{ref.numbering}}, {{ref.title}}, {{ref.revision}}, {{doc.numbering}} and {{doc.title}}; left empty, it inherits',
      ),
    ).toBeInTheDocument();
    const section = screen
      .getByRole('button', { name: /^References/ })
      .closest('.ui-property-section') as HTMLElement;
    const openCard = async (name: RegExp) => {
      await user.click(within(section).getByRole('button', { name }));
    };
    await openCard(/^Format/);
    await user.click(screen.getByRole('textbox', { name: 'To figures in the catalog' }));
    await user.paste('Item {{ref.numbering}}');
    await user.tab();
    expect(changes.at(-1)?.references?.formats?.['catalog-figure']).toBe('Item {{ref.numbering}}');
    expect(
      screen.getByRole('textbox', { name: 'To figures in other documents' }),
    ).toBeInTheDocument();
    await openCard(/^Links to the target/);
    await user.click(screen.getByRole('switch', { name: 'To the catalog' }));
    expect(changes.at(-1)?.references?.links?.catalog).toBe(true);
  }, 15_000);
});

// The template editor over its own state, as a host keeps it, reporting each change.
function Stateful({
  initial,
  onTemplate,
}: {
  initial: TemplateFile;
  onTemplate: (template: TemplateFile) => void;
}) {
  const [template, setTemplate] = useState(initial);
  return (
    <TemplateEditor
      template={template}
      onChange={(next) => {
        setTemplate(next);
        onTemplate(next);
      }}
    />
  );
}

describe('the template editor over a template it keeps', () => {
  it('DOCE-TEMPLATE-EDITOR-1.3 keeps the document landscape and its new section portrait in one run', async () => {
    const user = userEvent.setup();
    let last: TemplateFile | undefined;
    render(
      <Stateful
        initial={{ formatVersion: 1, id: 'plain' }}
        onTemplate={(next) => {
          last = next;
        }}
      />,
    );
    await openSections(user);
    const panel = screen.getByRole('region', { name: 'Template settings' });
    await user.click(within(panel).getByRole('radio', { name: 'Landscape' }));
    await user.click(screen.getByRole('button', { name: 'Add a section' }));
    expect(panel).toHaveAttribute('data-scope', 'section');
    await user.click(within(panel).getByRole('radio', { name: 'Portrait' }));
    expect(last?.page?.orientation).toBe('landscape');
    expect(last?.sections?.[0]?.page?.orientation).toBe('portrait');
  }, 15_000);

  it('DOCE-TEMPLATE-EDITOR-1.10 renames a style in use, and the blocks in it follow', async () => {
    const user = userEvent.setup();
    let last: TemplateFile | undefined;
    const lead = { type: 'paragraph', attrs: { style: 'lead' }, content: [] };
    render(
      <Stateful
        initial={{
          formatVersion: 1,
          id: 'plain',
          styles: { custom: { lead: { size: '13pt' } } },
          header: { content: [lead] },
        }}
        onTemplate={(next) => {
          last = next;
        }}
      />,
    );
    await openSections(user);
    await user.click(screen.getByRole('button', { name: /^lead\b/ }));
    const name = screen.getAllByRole('textbox', { name: 'Name' }).at(-1);
    if (!name) throw new Error('No style name');
    await user.clear(name);
    await user.type(name, 'opening{Enter}');
    expect(last?.styles?.custom).toEqual({ opening: { size: '13pt' } });
    expect(last?.header?.content).toEqual([{ ...lead, attrs: { style: 'opening' } }]);
  }, 15_000);
});

describe('a disabled template editor', () => {
  it('DOCE-TEMPLATE-EDITOR-1.1 locks every setting, still filters them and still picks the scope', async () => {
    const user = userEvent.setup();
    render(
      <TemplateEditor
        template={{ formatVersion: 1, id: 'plain', sections: [{ name: 'annex' }] }}
        onChange={() => undefined}
        isDisabled
      />,
    );
    await openSections(user);
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Settings of$/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Add a section' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Landscape' })).toBeDisabled();
    const filter = screen.getByRole('searchbox');
    await user.type(filter, 'orientation');
    expect(filter).toHaveValue('orientation');
    expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Landscape' })).toBeDisabled();
  }, 15_000);
});
