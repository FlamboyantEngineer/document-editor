import type { RefObject } from 'react';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { BASE_TEMPLATE, type LayoutRules, type TemplateFile } from '../../model/index.js';
import { sameRules, sectionRules } from './start-paging.js';
import type { DocumentLayoutOptions } from './use-document-layout.js';

const section = (sectionName: string) => {
  const type = documentSchema.nodes.page_section;
  if (!type) throw new Error('no page section');
  return type.create({ sectionName });
};

// A template whose section `name` repeats no table header, and whose section `other` does.
const withSections = (name: string): TemplateFile => ({
  ...BASE_TEMPLATE,
  sections: [
    { name, content: [], styles: { table: { repeatHeader: false } } },
    { name: 'other', content: [], styles: { table: { repeatHeader: true } } },
  ],
});

describe('the layout rules of each section', () => {
  it('DOCE-PAGINATION-4.5 reads the latest template and host rules as a section lays out', () => {
    const latest = {
      current: { template: withSections('annex') },
    } as unknown as RefObject<DocumentLayoutOptions>;
    const rulesOf = sectionRules(latest);
    if (typeof rulesOf !== 'function') throw new Error('no rules by section');
    expect(rulesOf(section('annex'), 0)).not.toBe(rulesOf(section('other'), 1));
    // The section renamed and the host's rules changed, without paging starting again.
    const heading = { keepsWithHeading: false };
    const layoutRules: LayoutRules = { heading };
    Object.assign(latest, { current: { template: withSections('appendix'), layoutRules } });
    const appendix = rulesOf(section('appendix'), 0);
    expect(appendix).not.toBe(rulesOf(section('other'), 1));
    expect(appendix).toBe(rulesOf(section('appendix'), 2));
    expect(appendix.heading).toBe(heading);
    // The same rules passed again as another object, as a host passing them inline does.
    Object.assign(latest, {
      current: {
        template: withSections('appendix'),
        layoutRules: { heading: { keepsWithHeading: false } },
      },
    });
    expect(rulesOf(section('appendix'), 3)).toBe(appendix);
  });

  it('DOCE-PAGINATION-5.11 tells host rules apart by their entries', () => {
    const heading = { keepsWithHeading: false };
    expect(sameRules({ heading }, { heading })).toBe(true);
    expect(sameRules(undefined, {})).toBe(true);
    // The same settings in a new object, as rules passed inline on each render are.
    expect(sameRules({ heading }, { heading: { keepsWithHeading: false } })).toBe(true);
    expect(sameRules({ heading }, { heading: { keepsWithHeading: true } })).toBe(false);
    expect(sameRules({ heading }, undefined)).toBe(false);
  });
});
