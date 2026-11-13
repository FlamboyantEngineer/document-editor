import { DOMSerializer } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { documentSchema, parseMarkup, roundTrip } from '../../../test/document-markup.js';
import { safeHref } from './dom-attributes.js';

function marksOf(html: string): string[] {
  const names: string[] = [];
  parseMarkup(html).descendants((node) => {
    for (const mark of node.marks) names.push(mark.type.name);
  });
  return names;
}

const BASELINE = JSON.stringify({
  version: 1,
  documentId: 'd2',
  numbering: 'DOC-2',
  title: 'Design',
  revision: null,
  revisionLabel: 'B',
  target: {
    id: 'h1',
    kind: 'figure',
    stable: true,
    numbering: '3',
    title: 'Flow',
    label: 'Figure 3',
  },
  defaultLabel: 'DOC-2',
}).replaceAll('"', '&quot;');

describe('marks', () => {
  it('DOCE-SCHEMA-3.8 keeps links that open elsewhere and who wrote a link or inline code', () => {
    const html =
      '<p><a href="https://example.com" target="_blank" rel="noopener noreferrer" data-id="l1" data-au="ada">site</a> <code data-au="ada">x</code></p>';
    expect(roundTrip(html)).toBe(html);
    expect(roundTrip('<p><a href="/a" target="_self">a</a></p>')).toBe('<p><a href="/a">a</a></p>');
  });

  it('DOCE-SCHEMA-3.8 reads no link from an address that could run script', () => {
    for (const href of ['javascript:alert(1)', ' JavaScript:alert(1)', 'java\tscript:alert(1)']) {
      expect(marksOf(`<p><a href="${href}">site</a></p>`)).toEqual([]);
    }
    expect(marksOf('<p><a href="data:text/html,<script>alert(1)</script>">x</a></p>')).toEqual([]);
    expect(marksOf('<p><a href="vbscript:x">site</a></p>')).toEqual([]);
  });

  it('DOCE-SCHEMA-3.8 reads web, mail, telephone and relative addresses as links', () => {
    for (const href of [
      'https://example.com/a?b=1#c',
      'HTTP://example.com',
      'mailto:ada@example.com',
      'tel:+15550100',
      '#section-2',
      '/guide/start',
      'notes/today.html',
      '//example.com/a',
    ]) {
      expect(roundTrip(`<p><a href="${href}">site</a></p>`)).toBe(
        `<p><a href="${href}">site</a></p>`,
      );
    }
  });

  it('DOCE-SCHEMA-3.8 writes no address for a stored link that could run script', () => {
    const link = documentSchema.marks.link?.create({ href: 'javascript:alert(1)' });
    const paragraph = documentSchema.node('paragraph', null, [
      documentSchema.text('site', link ? [link] : []),
    ]);
    const dom = DOMSerializer.fromSchema(documentSchema).serializeNode(paragraph) as HTMLElement;
    expect(dom.querySelector('a')?.hasAttribute('href')).toBe(false);
    expect(dom).toHaveTextContent('site');
  });

  it('DOCE-SCHEMA-3.8 tells which addresses a link may hold', () => {
    expect(safeHref('  https://example.com ')).toBe('https://example.com');
    expect(safeHref('\u0001javascript:alert(1)')).toBeNull();
    expect(safeHref('jav\nascript:alert(1)')).toBeNull();
    expect(safeHref('file:///etc/hosts')).toBeNull();
    expect(safeHref('')).toBeNull();
    expect(safeHref(null)).toBeNull();
  });

  it('DOCE-SCHEMA-3.8 records who wrote a span of text', () => {
    const html = '<p><span data-au="ada" data-ai="s1">typed</span></p>';
    expect(marksOf(html)).toEqual(['contributor']);
    expect(roundTrip(html)).toBe(html);
  });

  it('DOCE-SCHEMA-3.8 reads formatting from tags and text decoration', () => {
    expect(marksOf('<p><s>a</s><u>b</u><sup>c</sup><sub>d</sub></p>')).toEqual([
      'strike',
      'underline',
      'superscript',
      'subscript',
    ]);
    expect(
      marksOf(
        '<p><span style="text-decoration: line-through">a</span><span style="text-decoration: underline">b</span></p>',
      ),
    ).toEqual(['strike', 'underline']);
  });

  it('DOCE-SCHEMA-3.8 tells a suggested deletion from struck text and keeps comment highlights', () => {
    expect(marksOf('<p><del>gone</del></p>')).toEqual(['strike']);
    expect(
      marksOf('<p><del data-id="s1">gone</del><ins data-comment-id="c1">new</ins></p>'),
    ).toEqual(['deletion', 'insertion']);
    expect(marksOf('<p><ins>plain</ins><mark>plain</mark></p>')).toEqual([]);
    const highlight =
      '<p><mark data-id="h1" data-comment-id="c1" data-comment-state="resolved">x</mark></p>';
    expect(roundTrip(highlight)).toBe(highlight);
    expect(documentSchema.marks.comment_highlight?.spec.inclusive).toBe(false);
  });

  it('DOCE-SCHEMA-3.8 keeps a reference and writes the format key templates style it by', () => {
    const html = `<p><span data-reference="true" data-ref-type="external-document" data-reference-baseline="${BASELINE}" data-target-id="d2" data-doc-number="DOC-2" data-doc-title="Design">DOC-2</span></p>`;
    const written = roundTrip(html);
    expect(written).toContain('class="inline-reference"');
    expect(written).toContain('data-reference-format="external-document-figure"');
    expect(written).toContain('data-doc-number="DOC-2" data-doc-title="Design"');
    expect(roundTrip(written)).toBe(written);
    const broken = roundTrip(
      '<p><span data-reference="true" data-ref-type="internal-table" data-broken="true">T</span></p>',
    );
    expect(broken).toContain('class="inline-reference reference-broken"');
    expect(broken).toContain('data-reference-format="internal-table"');
  });

  it('DOCE-SCHEMA-1.4 writes the format key of a reference type the host adds', () => {
    const html = '<p><span data-reference="true" data-ref-type="catalogue-entry">Entry</span></p>';
    expect(roundTrip(html)).not.toContain('data-reference-format');
    expect(roundTrip(html, { schema: { referenceTypes: ['catalogue-entry'] } })).toContain(
      'data-reference-format="catalogue-entry"',
    );
  });
});
