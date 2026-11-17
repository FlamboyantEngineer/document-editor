import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
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
    // The paragraph numbering the parent sets shows as inherited while the template sets none.
    const [format] = screen.getAllByRole('combobox', { name: 'Format' });
    expect(format).toHaveAttribute('placeholder', '1.');
    // A zero height is a value of the template's own, not an unset one.
    const height = screen.getByRole('textbox', { name: 'Header height' });
    await user.type(height, '0pt');
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
    expect(changes.at(-1)?.references?.formats?.['catalog-figure']).toBe('Item {{ref.numbering}}');
    expect(
      screen.getByRole('textbox', { name: 'To figures in other documents' }),
    ).toBeInTheDocument();
    await openCard(/^Links to the target/);
    await user.click(screen.getByRole('checkbox', { name: 'To the catalog' }));
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
    const lead = { type: 'paragraph', attrs: { className: 'lead' }, content: [] };
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
    await user.click(screen.getByRole('button', { name: /^lead\b/ }));
    const name = screen.getAllByRole('textbox', { name: 'Name' }).at(-1);
    if (!name) throw new Error('No style name');
    await user.clear(name);
    await user.type(name, 'opening{Enter}');
    expect(last?.styles?.custom).toEqual({ opening: { size: '13pt' } });
    expect(last?.header?.content).toEqual([{ ...lead, attrs: { className: 'opening' } }]);
  }, 15_000);
});

describe('a disabled template editor', () => {
  it('DOCE-TEMPLATE-EDITOR-1.1 locks every setting and still filters them', async () => {
    const user = userEvent.setup();
    render(
      <TemplateEditor
        template={{ formatVersion: 1, id: 'plain' }}
        onChange={() => undefined}
        isDisabled
      />,
    );
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Landscape' })).toBeDisabled();
    const filter = screen.getByRole('searchbox');
    await user.type(filter, 'orientation');
    expect(filter).toHaveValue('orientation');
    expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Landscape' })).toBeDisabled();
  }, 15_000);
});
