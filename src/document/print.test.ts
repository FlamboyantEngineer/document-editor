// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { BASE_TEMPLATE, type DocumentFile, type StoredNode } from '../model/index.js';
import { type PrintPageOptions, renderPrintPage } from './print.js';

const text = (value: string, marks?: StoredNode['marks']): StoredNode =>
  marks ? { type: 'text', text: value, marks } : { type: 'text', text: value };

const BASELINE = {
  version: 1,
  documentId: 'doc-7',
  numbering: 'SPEC-7',
  title: 'Cited document',
  revision: null,
  revisionLabel: '',
  target: null,
  defaultLabel: 'SPEC-7',
};

const FILE: DocumentFile = {
  formatVersion: 1,
  sections: [
    {
      name: null,
      content: [
        { type: 'heading', attrs: { id: 'a1000001', level: 1 }, content: [text('Scope')] },
        {
          type: 'paragraph',
          attrs: { id: 'a1000002' },
          content: [
            text('See '),
            text('the scope', [{ type: 'reference', attrs: { target: 'a1000001' } }]),
            text(' and '),
            text('SPEC-7', [
              {
                type: 'reference',
                attrs: { referenceType: 'external-document', baseline: JSON.stringify(BASELINE) },
              },
            ]),
            text(' <b>raw</b>'),
            { type: 'footnote', attrs: { id: 'n1' }, content: [text('A note.')] },
          ],
        },
        { type: 'figure', attrs: { id: 'a1000003', src: 'chart.png', alt: 'Chart' } },
        {
          type: 'paragraph',
          content: [
            {
              type: 'signature',
              attrs: {
                person: 'u1',
                label: 'Ada',
                vector: {
                  viewBox: { width: 10, height: 10 },
                  paths: [{ d: 'M0 0L10 10', fill: false, strokeWidth: 1 }],
                },
              },
            },
          ],
        },
      ],
    },
  ],
};

// The test document's page.
const pageOf = (options?: PrintPageOptions) => renderPrintPage(FILE, BASE_TEMPLATE, options);

describe('renderPrintPage', () => {
  it('DOCE-EDITOR-6.27 renders a stored document as a standalone page with no DOM', () => {
    expect(typeof document).toBe('undefined');
    const view = pageOf({
      title: 'Notes & plans',
      stylesheets: ['https://example.test/document.css'],
    });
    expect(view.startsWith('<!doctype html>')).toBe(true);
    expect(view).toContain('<title>Notes &amp; plans</title>');
    expect(view).toContain('<link rel="stylesheet" href="https://example.test/document.css">');
    expect(view).toContain(
      'class="de-document-editor" data-mode="reading" data-markup="all" data-print="true"',
    );
    expect(view).toMatch(
      /@page de-static-0 \{ size: [\d.]+px [\d.]+px; margin: [\d.]+px [\d.]+px [\d.]+px [\d.]+px; \}/,
    );
    expect(view).toContain('See ');
    expect(view).toContain(' &lt;b&gt;raw&lt;/b&gt;');
    expect(view).not.toContain('contenteditable');
    expect(typeof document).toBe('undefined');
  });

  it('DOCE-EDITOR-6.27 keeps the anchors, numbers and links print keeps', () => {
    const view = pageOf({
      citationHref: ({ baseline }) => `https://example.test/${baseline.documentId}`,
    });
    expect(view).toMatch(/<h1[^>]* id="a1000001"[^>]* data-number="1\."/);
    expect(view).toContain('<a href="#a1000001" data-print-link="reference">the scope</a>');
    expect(view).toContain(
      '<a href="https://example.test/doc-7" data-print-link="citation">SPEC-7</a>',
    );
    expect(view).toMatch(
      /<sup[^>]* id="fnref-n1"[^>]*><a href="#fn-n1" data-print-link="footnote">/,
    );
    expect(view).toMatch(
      /<p[^>]* id="fn-n1"[^>]*><span[^>]*><a href="#fnref-n1" data-print-link="footnote-back">/,
    );
  });

  it('DOCE-EDITOR-6.27 loads images at once from the host address and draws signatures', () => {
    const view = pageOf({
      resolveImage: (src) => `https://assets.example.test/${src}`,
    });
    expect(view).toMatch(/<img[^>]* src="https:\/\/assets\.example\.test\/chart\.png"/);
    expect(view).toMatch(/<img[^>]* loading="eager"/);
    expect(view).toContain(
      '<path d="M0 0L10 10" fill="none" stroke="currentColor" stroke-width="1"></path>',
    );
    expect(view).toContain('<span class="de-signature__name">Ada</span>');
    expect(view).not.toContain('data-signature-vector');
  });
});
