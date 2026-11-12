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
    expect(resolveTemplateFile(BASE, options)).toEqual({ ...BASE, parent: null });
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

  it('DOCE-FORMAT-3.1 merges paragraph numbering levels by their place', () => {
    const parent = template('parent', {
      styles: { paragraph: { numbering: { levels: [{ format: '1.' }, { format: '1.1.' }] } } },
    });
    const child = template('child', {
      styles: { paragraph: { numbering: { levels: [null, { textIndent: '40pt' }] } } },
    });
    expect(mergeTemplateFiles(parent, child).styles?.paragraph?.numbering?.levels).toEqual([
      { format: '1.' },
      { format: '1.1.', textIndent: '40pt' },
    ]);
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
