import { describe, expect, it } from 'vitest';
import {
  documentSchema,
  findNode,
  parseMarkup,
  roundTrip,
  writeMarkup,
} from '../../../test/document-markup.js';
import { createDocumentSchema } from '../index.js';

const region = (name: string, inner = '') =>
  `<div class="pm-${name}" data-pm-${name}="true">${inner}</div>`;

function pageMarkup({ section = '', header = '', content = '<p>Body</p>', notes = '' } = {}) {
  const page = [
    region('page-header', header),
    region('page-content', content),
    region('page-footnotes', notes),
    region('page-footer'),
  ].join('');
  return `<div class="pm-section" data-pm-section="true"${section}><div class="pm-page" data-pm-page="true">${page}</div></div>`;
}

describe('page nodes', () => {
  it('DOCE-SCHEMA-3.1 reads a section of pages with their header, content, footnotes and footer', () => {
    const doc = parseMarkup(pageMarkup({ section: ' data-section-name="Intro"' }));
    const page = findNode(doc, 'page');
    expect(page?.content.content.map((child) => child.type.name)).toEqual([
      'page_header',
      'page_content',
      'page_footnotes',
      'page_footer',
    ]);
    expect(findNode(doc, 'page_section')?.attrs.sectionName).toBe('Intro');
    const once = writeMarkup(doc);
    expect(roundTrip(once)).toBe(once);
  });

  it('DOCE-SCHEMA-3.1 keeps a template header and holds the placeholder in an empty one', () => {
    const doc = parseMarkup(pageMarkup({ header: '<p>Title</p>' }));
    expect(findNode(doc, 'page_header')?.attrs.html).toBe('<p>Title</p>');
    expect(findNode(doc, 'page_footer')?.attrs.html).toBe('Footer (Template)');
    const cleared = parseMarkup(pageMarkup({ section: ' data-page-footer=""' }));
    expect(findNode(cleared, 'page_footer')?.attrs.html).toBe('');
    const named = createDocumentSchema({ schema: { footerPlaceholder: 'Page footer' } });
    expect(findNode(parseMarkup(pageMarkup(), named), 'page_footer')?.attrs.html).toBe(
      'Page footer',
    );
  });

  it('DOCE-SCHEMA-3.1 reads a locked section and page region and keeps them locked', () => {
    const html = pageMarkup({ section: ' data-section-editable="false"' });
    const doc = parseMarkup(html);
    expect(findNode(doc, 'page_section')?.attrs.editable).toBe(false);
    expect(writeMarkup(doc)).toContain('data-section-editable="false" contenteditable="false"');
  });

  it('DOCE-SCHEMA-3.1 pairs a footnote marker with its numbered entry', () => {
    const content = '<p>Body<sup data-footnote-id="f1" data-footnote-number="1">1</sup></p>';
    const notes =
      '<p class="pm-footnote-entry" data-footnote-entry="true" data-footnote-id="f1" data-footnote-number="1"><span class="pm-footnote-entry-number">1</span><span class="pm-footnote-entry-content">Note</span></p>';
    const doc = parseMarkup(pageMarkup({ content, notes }));
    expect(findNode(doc, 'footnote_reference')?.attrs).toMatchObject({
      footnoteId: 'f1',
      footnoteNumber: 1,
    });
    expect(findNode(doc, 'footnote_entry')?.textContent).toBe('Note');
    const html = writeMarkup(doc);
    expect(html).toContain(
      '<sup class="footnote-reference" data-footnote-reference="true" contenteditable="false" spellcheck="false" data-footnote-id="f1" data-footnote-number="1" title="Footnote 1">1</sup>',
    );
    expect(html).toContain(
      '<span class="pm-footnote-entry-number" contenteditable="false">1</span><span class="pm-footnote-entry-content">Note</span>',
    );
  });

  it('DOCE-SCHEMA-3.1 reads a manual page break', () => {
    const html = '<p>One</p><hr data-page-break="manual" class="manual-page-break"><p>Two</p>';
    expect(findNode(parseMarkup(html), 'page_break')).toBeDefined();
    expect(roundTrip(html)).toBe(html);
  });

  it('DOCE-SCHEMA-3.2 keeps a template block and the variables a template fills in', () => {
    const block =
      '<div data-dynamic-template="true" data-dynamic-template-html="{{title}}" data-dynamic-template-rendered-html="Plan" class="dynamic-template-block" data-dynamic-template-keys="title"></div>';
    expect(roundTrip(block)).toBe(block);
    const variable = '<p>By <span data-template-variable="author">Ada</span></p>';
    const doc = parseMarkup(variable);
    expect(findNode(doc, 'template_variable')?.attrs.variableKey).toBe('author');
    expect(roundTrip(variable)).toBe(variable);
    expect(documentSchema.nodes.template_variable?.spec.marks).toBe('');
  });
});
