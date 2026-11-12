import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { writeDocumentFile } from './document-format-convert.js';
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
