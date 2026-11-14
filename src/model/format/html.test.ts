import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { writeDocumentFile } from './document-format-write.js';
import { cleanWordHtml, isWordHtml, readHtml, readHtmlContent, writeHtml } from './html.js';

const WORD = [
  '<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><style>p.MsoNormal{margin:0}</style></head><body>',
  '<p class="MsoNormal" style="mso-margin-top-alt:auto;color:red">Intro<o:p></o:p></p>',
  '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1"><![if !supportLists]><span style="mso-list:Ignore">·<span> </span></span><![endif]>One</p>',
  '<p class="MsoListParagraph" style="mso-list:l0 level2 lfo1"><![if !supportLists]><span style="mso-list:Ignore">o<span> </span></span><![endif]>Nested</p>',
  '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1"><![if !supportLists]><span style="mso-list:Ignore">·<span> </span></span><![endif]>Two</p>',
  '</body></html>',
].join('');

describe('HTML interchange', () => {
  it('DOCE-FORMAT-6.1 writes a document as HTML and reads it back, inertly', () => {
    const doc = readHtml(
      '<h1>Scope</h1><p>Text <strong>bold</strong><img src="x" onerror="window.hit=1"></p>',
      documentSchema,
      document,
    );
    const html = writeHtml(doc, document);
    expect(html).toContain('<h1');
    expect(html).toContain('<strong>bold</strong>');
    expect((window as unknown as { hit?: number }).hit).toBeUndefined();
    // The markup is parsed into a document of its own, with no window to run it in.
    const parse = vi.spyOn(window.DOMParser.prototype, 'parseFromString');
    readHtml('<p>Again</p>', documentSchema, document);
    const parsed = parse.mock.results[0]?.value as Document | undefined;
    parse.mockRestore();
    expect(parsed).toBeDefined();
    expect(parsed).not.toBe(document);
    expect(parsed?.defaultView).toBeNull();
    expect(
      writeDocumentFile(readHtml(html, documentSchema, document)).sections[0]?.content[0]?.type,
    ).toBe('heading');
  });

  it('DOCE-FORMAT-6.2 cleans word processor HTML, its list paragraphs becoming lists', () => {
    expect(isWordHtml(WORD)).toBe(true);
    expect(isWordHtml('<p>Plain</p>')).toBe(false);
    const clean = cleanWordHtml(WORD, document);
    expect(clean).not.toMatch(/Mso|mso-|o:p|<style/);
    expect(clean).toContain('style="color:red"');
    expect(clean.replace(/\s+/g, '')).toContain(
      '<ul><li><p>One</p><ul><li><p>Nested</p></li></ul></li><li><p>Two</p></li></ul>',
    );
  });

  it('DOCE-FORMAT-6.2 starts a list of its own for another list or another kind of list', () => {
    const item = (list: string, marker: string, text: string) =>
      `<p class="MsoListParagraph" style="mso-list:${list}"><span style="mso-list:Ignore">${marker}</span>${text}</p>`;
    const lists = (...items: string[]) =>
      cleanWordHtml(`<body>${items.join('')}</body>`, document).replace(/\s+/g, '');
    // A bulleted list, then a numbered one, then another numbered one that starts again.
    expect(
      lists(
        item('l0 level1 lfo1', '·', 'A'),
        item('l0 level1 lfo1', '·', 'B'),
        item('l1 level1 lfo2', '1.', 'One'),
        item('l1 level1 lfo2', '2.', 'Two'),
        item('l1 level1 lfo3', '1.', 'First'),
      ),
    ).toContain(
      '<ul><li><p>A</p></li><li><p>B</p></li></ul>' +
        '<ol><li><p>One</p></li><li><p>Two</p></li></ol>' +
        '<ol><li><p>First</p></li></ol>',
    );
    // Under one item too, and the list above goes on after them.
    expect(
      lists(
        item('l0 level1 lfo1', '·', 'A'),
        item('l0 level2 lfo1', 'o', 'Nested'),
        item('l2 level2 lfo4', '1.', 'Numbered'),
        item('l0 level1 lfo1', '·', 'B'),
      ),
    ).toContain(
      '<ul><li><p>A</p><ul><li><p>Nested</p></li></ul><ol><li><p>Numbered</p></li></ol></li>' +
        '<li><p>B</p></li></ul>',
    );
  });

  it('DOCE-FORMAT-6.3 reads HTML as stored content for a region or a section', () => {
    const content = readHtmlContent(
      'Page <span data-template-variable="page.current"></span> of {{page.total}}<h2>Scope</h2><script>alert(1)</script>',
      documentSchema,
      document,
    );
    expect(content).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Page ' },
          { type: 'variable', attrs: { key: 'page.current' } },
          { type: 'text', text: ' of {{page.total}}' },
        ],
      },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Scope' }] },
    ]);
    expect(readHtmlContent('', documentSchema, document)).toEqual([]);
  });
});
