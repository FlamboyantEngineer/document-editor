import { describe, expect, it } from 'vitest';
import {
  BASE_TEMPLATE,
  extensionRecord,
  hasTemplateParentCycle,
  hasTemplateParentCycleAsync,
  mergeTemplateFiles,
  missingTemplateSettings,
  resolveSectionRegion,
  resolveTemplateFile,
  resolveTemplateFileAsync,
  type TemplateFile,
  templateScopeStyles,
  type TemplateStyles,
} from '../index.js';

const template = (id: string, settings: Partial<TemplateFile> = {}): TemplateFile => ({
  formatVersion: 1,
  id,
  ...settings,
});

const BASE = template('base', {
  name: 'Base',
  page: { size: 'A4', margins: { top: '25mm', left: '25mm' } },
  styles: { heading1: { numbering: { format: '1.' }, size: '22pt' } },
  header: { content: [{ type: 'paragraph' }] },
  sections: [{ name: 'body' }],
});

describe('template inheritance', () => {
  it('DOCE-FORMAT-3.1 merges a template over its parent setting by setting', () => {
    const child = template('child', {
      parent: 'base',
      page: { size: null, margins: { top: '1in' } },
      styles: { heading1: { numbering: { format: '' } } },
      header: { inherit: true, content: [] },
      sections: [{ name: 'scope' }],
    });
    const merged = mergeTemplateFiles(BASE, child);
    expect(merged).toEqual({
      formatVersion: 1,
      id: 'child',
      name: 'Base',
      parent: 'base',
      page: { size: 'A4', margins: { top: '1in', left: '25mm' } },
      styles: { heading1: { numbering: { format: '' }, size: '22pt' } },
      header: { content: [{ type: 'paragraph' }] },
      sections: [{ name: 'scope' }],
    });
    expect(merged.page).not.toBe(BASE.page);
  });

  it('DOCE-FORMAT-3.1 leaves a blank reference format to the parent', () => {
    const parent = template('base', {
      references: {
        formats: { 'internal-heading': 'see {{ref.numbering}}', 'internal-table': 'T' },
      },
    });
    const child = template('child', {
      parent: 'base',
      references: {
        formats: { 'internal-heading': '  ', 'internal-table': 'Table {{ref.numbering}}' },
      },
    });
    expect(mergeTemplateFiles(parent, child).references?.formats).toEqual({
      'internal-heading': 'see {{ref.numbering}}',
      'internal-table': 'Table {{ref.numbering}}',
    });
    expect(mergeTemplateFiles(null, template('alone')).references).toBeUndefined();
  });

  it('DOCE-FORMAT-3.2 resolves the chain a template inherits, ending at the base template', async () => {
    const store = new Map<string, TemplateFile>([
      ['base', BASE],
      ['middle', template('middle', { name: 'Middle', page: { orientation: 'landscape' } })],
    ]);
    const options = { loadTemplate: (id: string) => store.get(id), baseTemplateId: 'base' };
    const leaf = template('leaf', { parent: 'middle' });
    const resolved = resolveTemplateFile(leaf, options);
    expect(resolved).toMatchObject({
      id: 'leaf',
      name: 'Middle',
      page: { size: 'A4', orientation: 'landscape' },
    });
    expect(await resolveTemplateFileAsync(leaf, options)).toEqual(resolved);
    expect(resolveTemplateFile(BASE, options)).toMatchObject({ ...BASE, parent: null });
    expect(resolveTemplateFile(template('lost', { parent: 'gone' }), options).name).toBeUndefined();
  });

  it('DOCE-FORMAT-3.2 stops a chain that comes back to a template', () => {
    const store = new Map([
      ['a', template('a', { parent: 'b', name: 'A' })],
      ['b', template('b', { parent: 'a', name: 'B' })],
    ]);
    const resolved = resolveTemplateFile(template('a', { parent: 'b' }), {
      loadTemplate: (id) => store.get(id),
    });
    expect(resolved.name).toBe('B');
  });

  it('DOCE-FORMAT-3.3 finds a parent that would make a cycle', async () => {
    const store = new Map([
      ['a', template('a', { parent: 'b' })],
      ['b', template('b', { parent: 'c' })],
      ['c', template('c')],
    ]);
    const load = (id: string) => store.get(id);
    expect(hasTemplateParentCycle('c', 'a', load)).toBe(true);
    expect(hasTemplateParentCycle('c', 'c', load)).toBe(true);
    expect(hasTemplateParentCycle('d', 'a', load)).toBe(false);
    expect(await hasTemplateParentCycleAsync('c', 'a', async (id) => load(id))).toBe(true);
  });

  it('DOCE-FORMAT-3.4 gives a section the template region unless it has its own', () => {
    const header = { content: [{ type: 'paragraph' }] };
    const own = { content: [] };
    expect(resolveSectionRegion({ header }, { header: own }, 'header')).toEqual(own);
    expect(resolveSectionRegion({ header }, { header: { ...own, inherit: true } }, 'header')).toBe(
      header,
    );
    expect(resolveSectionRegion({ header }, null, 'header')).toBe(header);
    expect(resolveSectionRegion({}, null, 'footer')).toBeNull();
  });

  it('DOCE-FORMAT-3.4 resolves a section region field by field over the template', () => {
    const header = { content: [{ type: 'paragraph' }], height: '20mm', spacingToContent: '4mm' };
    expect(resolveSectionRegion({ header }, { header: { height: '30mm' } }, 'header')).toEqual({
      ...header,
      height: '30mm',
    });
    expect(resolveSectionRegion({}, { footer: { spacingToContent: '2mm' } }, 'footer')).toEqual({
      spacingToContent: '2mm',
    });
  });

  it('DOCE-FORMAT-3.1 replaces paragraph numbering levels whole and merges contents levels by place', () => {
    const parent = template('parent', {
      styles: {
        paragraph: { numbering: { levels: [{ format: '1.' }, { format: '1.1.' }] } },
        contents: { levels: [{ indentation: '0pt' }, { indentation: '10pt' }] },
      },
    });
    const child = template('child', {
      styles: {
        paragraph: { numbering: { levels: [null, { textIndent: '40pt' }] } },
        contents: { levels: [null, { spaceBefore: '2pt' }] },
      },
    });
    const merged = mergeTemplateFiles(parent, child).styles;
    expect(merged?.paragraph?.numbering?.levels).toEqual([null, { textIndent: '40pt' }]);
    expect(merged?.contents?.levels).toEqual([
      { indentation: '0pt' },
      { indentation: '10pt', spaceBefore: '2pt' },
    ]);
    // A template that sets no levels keeps the ones it inherits.
    const unset = template('unset', { styles: { paragraph: { numbering: { format: '1.' } } } });
    expect(mergeTemplateFiles(parent, unset).styles?.paragraph?.numbering?.levels).toHaveLength(2);
  });
});

describe('heading formats', () => {
  it('DOCE-FORMAT-3.5 gives a heading level without a format the nearest higher one the styles set', () => {
    const parent = template('parent', {
      styles: {
        heading1: { numbering: { format: '1.' } },
        heading2: { numbering: { format: '1.1.' } },
        heading3: { numbering: { format: '1.1.1.' } },
      },
    });
    const child = template('child', {
      styles: {
        heading1: { numbering: { format: 'A.1.1.' } },
        heading3: { numbering: { format: '' } },
      },
      sections: [{ name: 'annex', styles: { heading2: { numbering: { format: 'I.i.' } } } }],
    });
    const merged = mergeTemplateFiles(parent, child);
    const formats = (styles: TemplateStyles | null | undefined) =>
      ([1, 2, 3, 4] as const).map((level) => styles?.[`heading${level}`]?.numbering?.format);
    expect(formats(merged.styles)).toEqual(['A.1.1.', 'A.1.1.', '', undefined]);
    const annex = templateScopeStyles(merged, merged.sections?.[0]);
    expect(formats(annex)).toEqual(['A.1.1.', 'I.i.', 'I.i.', 'I.i.']);
    // The template's own styles are not changed.
    expect(child.styles?.heading2).toBeUndefined();
  });
});

describe('template extensions and missing settings', () => {
  it('DOCE-TEMPLATES-10.6 reads a keyed extension record, false removing an inherited entry', () => {
    const parent = template('parent', {
      extensions: { fields: { owner: { label: 'Owner' }, stage: { label: 'Stage' } } },
    });
    const child = template('child', {
      extensions: { fields: { owner: null, stage: false, review: { label: 'Review' } } },
    });
    expect(extensionRecord(mergeTemplateFiles(parent, child), 'fields')).toEqual({
      owner: { label: 'Owner' },
      review: { label: 'Review' },
    });
    expect(extensionRecord(child, 'unknown')).toEqual({});
    expect(extensionRecord(template('t', { extensions: { fields: [1] } }), 'fields')).toEqual({});
  });

  it('DOCE-TEMPLATES-10.7 lists the settings a template leaves unset that the base sets', () => {
    const store = new Map([[BASE_TEMPLATE.id, BASE_TEMPLATE]]);
    const resolved = resolveTemplateFile(template('full'), {
      loadTemplate: (id) => store.get(id),
      baseTemplateId: BASE_TEMPLATE.id,
    });
    expect(missingTemplateSettings(resolved)).toEqual([]);
    const root = template('root', {
      page: { size: 'A4', orientation: 'portrait' },
      styles: { heading1: { size: '20pt' } },
    });
    const missing = missingTemplateSettings(root);
    expect(missing).toContain('page.margins');
    expect(missing).toContain('styles.heading1.font');
    expect(missing).not.toContain('styles.heading1.size');
    expect(missing).not.toContain('page.size');
    expect(missingTemplateSettings(root, template('host', { page: { size: 'A5' } }))).toEqual([]);
  });
});
