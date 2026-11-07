import { describe, expect, it } from 'vitest';
import {
  findSectionByName,
  normalizeTemplateSectionName,
  resolveDocumentStructuralVariables,
  resolveRequiredTemplateSections,
} from '../index.js';

describe('template sections', () => {
  it('DOCE-TEMPLATES-4.1 finds a section by name without case or surrounding space', () => {
    const sections = [{ sectionName: 'Scope' }, null, { sectionName: 3 }];
    expect(findSectionByName(sections, ' scope ')).toBe(sections[0]);
    expect(findSectionByName(sections, '3')).toBe(sections[2]);
    expect(findSectionByName(sections, '')).toBeNull();
    expect(findSectionByName('Scope', 'scope')).toBeNull();
    expect(normalizeTemplateSectionName(null)).toBe('');
  });

  it('DOCE-TEMPLATES-4.2 requires the sections that say so or that the older list names', () => {
    const required = resolveRequiredTemplateSections({
      sections: [
        { sectionName: 'Intro' },
        { sectionName: 'Scope', required: false },
        { sectionName: 'Body', required: true },
        { sectionName: 'Notes' },
      ],
      minimumContent: {
        contentSections: [
          { sectionName: 'intro', hint: 'Start here' },
          { sectionName: 'Scope' },
          { sectionName: 'Annex' },
        ],
      },
    });
    expect(required).toEqual([
      { sectionName: 'Intro', hint: 'Start here', required: true },
      { sectionName: 'Body', required: true },
      { sectionName: 'Annex', required: true },
    ]);
    expect(
      resolveRequiredTemplateSections({
        minimumContent: { contentSections: [{ sectionName: 'A' }] },
      }),
    ).toEqual([{ sectionName: 'A', required: true }]);
    expect(resolveRequiredTemplateSections(null)).toEqual([]);
  });

  it('DOCE-TEMPLATES-4.3 turns structural variables into generated lists', () => {
    const block = (kind: string) =>
      `<div data-toc-block="true" data-toc-type="${kind}" data-min-level="6" class="toc-block"></div>`;
    expect(
      resolveDocumentStructuralVariables(
        '<p>{{ table_of_figures }}</p>{{acronyms}}{{unknown}}{{constructor}}',
      ),
    ).toBe(`<p>${block('figures')}</p>${block('acronyms')}{{unknown}}{{constructor}}`);
    expect(resolveDocumentStructuralVariables('{{table_of_content}}')).toBe(block('toc'));
    expect(resolveDocumentStructuralVariables(4)).toBe(4);
  });
});
