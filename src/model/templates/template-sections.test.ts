import { describe, expect, it } from 'vitest';
import { findTemplateSection, requiredTemplateSections, type TemplateFile } from '../index.js';

const TEMPLATE: Pick<TemplateFile, 'sections'> = {
  sections: [
    { name: 'intro', required: true },
    { name: 'scope', required: false },
    { name: 'annex' },
    { name: 'body', required: true },
  ],
};

describe('template sections', () => {
  it('DOCE-TEMPLATES-4.1 finds a section by name', () => {
    expect(findTemplateSection(TEMPLATE, 'scope')).toBe(TEMPLATE.sections?.[1]);
    expect(findTemplateSection(TEMPLATE, 'Scope')).toBeNull();
    expect(findTemplateSection(TEMPLATE, null)).toBeNull();
    expect(findTemplateSection({}, 'scope')).toBeNull();
  });

  it('DOCE-TEMPLATES-4.2 lists the sections every document has', () => {
    expect(requiredTemplateSections(TEMPLATE).map((section) => section.name)).toEqual([
      'intro',
      'body',
    ]);
    expect(requiredTemplateSections({})).toEqual([]);
  });
});
