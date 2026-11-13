import { describe, expect, it } from 'vitest';
import type { TemplateFile } from '../../model/index.js';
import {
  freshSectionName,
  renameSection,
  sectionNameOf,
  withNamedSection,
  withoutSection,
  withSectionAt,
  withSectionMoved,
} from './template-section-list.js';

const TEMPLATE: TemplateFile = {
  formatVersion: 1,
  id: 'plain',
  sections: [{ name: 'cover' }, { name: 'body', label: 'Body' }, { name: 'annex' }],
};

const names = (template: TemplateFile) => template.sections?.map((section) => section.name);

describe('sectionNameOf', () => {
  it('DOCE-TEMPLATE-EDITOR-2.3 writes a typed section name in lower case with underscores', () => {
    expect(sectionNameOf('  Annex B: Notes ')).toBe('annex_b_notes');
    expect(sectionNameOf('!!')).toBe('');
  });
});

describe('renameSection', () => {
  it('DOCE-TEMPLATE-EDITOR-2.3 renames a section to the sanitised name', () => {
    const renamed = renameSection(TEMPLATE, 'body', 'Main Body');
    expect(renamed).toMatchObject({ name: 'main_body' });
    if (!('template' in renamed)) throw new Error('refused');
    expect(names(renamed.template)).toEqual(['cover', 'main_body', 'annex']);
    expect(renamed.template.sections?.[1]?.label).toBe('Body');
    expect(names(TEMPLATE)).toEqual(['cover', 'body', 'annex']);
  });

  it('DOCE-TEMPLATE-EDITOR-2.3 refuses an empty name and one another section has', () => {
    expect(renameSection(TEMPLATE, 'body', ' ?! ')).toEqual({ problem: 'empty' });
    expect(renameSection(TEMPLATE, 'body', 'Annex')).toEqual({ problem: 'taken' });
    expect(renameSection(TEMPLATE, 'body', 'BODY')).toMatchObject({ name: 'body' });
  });
});

describe('the section list', () => {
  it('DOCE-TEMPLATE-EDITOR-2.4 adds a section at an index, clamped, or at the end', () => {
    expect(names(withSectionAt(TEMPLATE, { name: 'new' }, 1))).toEqual([
      'cover',
      'new',
      'body',
      'annex',
    ]);
    expect(names(withSectionAt(TEMPLATE, { name: 'new' }, 9))?.at(-1)).toBe('new');
    expect(names(withSectionAt(TEMPLATE, { name: 'new' }))?.at(-1)).toBe('new');
    expect(names(withSectionAt({ formatVersion: 1, id: 'empty' }, { name: 'new' }, -2))).toEqual([
      'new',
    ]);
  });

  it('DOCE-TEMPLATE-EDITOR-2.4 moves a section by name, within the list', () => {
    expect(names(withSectionMoved(TEMPLATE, 'annex', -1))).toEqual(['cover', 'annex', 'body']);
    expect(names(withSectionMoved(TEMPLATE, 'cover', 2))).toEqual(['body', 'annex', 'cover']);
    expect(withSectionMoved(TEMPLATE, 'cover', -1)).toBe(TEMPLATE);
    expect(withSectionMoved(TEMPLATE, 'missing', 1)).toBe(TEMPLATE);
  });

  it('DOCE-TEMPLATE-EDITOR-2.4 changes and takes out a section by name', () => {
    const changed = withNamedSection(TEMPLATE, 'annex', (section) => ({ ...section, label: 'A' }));
    expect(changed.sections?.[2]).toEqual({ name: 'annex', label: 'A' });
    expect(withNamedSection(TEMPLATE, 'missing', (section) => section)).toBe(TEMPLATE);
    expect(names(withoutSection(TEMPLATE, 'body'))).toEqual(['cover', 'annex']);
    expect(withoutSection(TEMPLATE, 'missing')).toBe(TEMPLATE);
  });

  it('DOCE-TEMPLATE-EDITOR-2.4 names a new section with the first free number', () => {
    expect(freshSectionName(TEMPLATE)).toBe('section_4');
    expect(
      freshSectionName({ ...TEMPLATE, sections: [{ name: 'section_2' }, { name: 'section_3' }] }),
    ).toBe('section_4');
    expect(freshSectionName({ formatVersion: 1, id: 'empty' })).toBe('section_1');
  });
});
