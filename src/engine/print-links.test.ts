import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { footnoteState, note, paragraph, text } from '../../test/footnote-fixtures.js';
import { BASE_TEMPLATE, type ReferenceBaseline, type StoredNode } from '../model/index.js';
import { documentSnapshot } from './snapshot.js';

const BASELINE: ReferenceBaseline = {
  version: 1,
  documentId: 'doc-7',
  numbering: 'SPEC-7',
  title: 'Cited document',
  revision: null,
  revisionLabel: '',
  target: null,
  defaultLabel: 'SPEC-7',
};

const reference = (value: string, attrs: Record<string, unknown>): StoredNode =>
  text(value, [{ type: 'reference', attrs }]);

const heading = (id: string, value: string): StoredNode => ({
  type: 'heading',
  attrs: { id, level: 1 },
  content: [text(value)],
});

// A page with a numbered heading, references to it, to a gone target and to another document, and
// a footnote, inside an editor root.
function linkedView() {
  const state = footnoteState([
    heading('h-scope', 'Scope'),
    heading('h-limits', 'Limits'),
    {
      ...paragraph(
        text('See '),
        reference('the scope', { target: 'h-scope' }),
        text(', '),
        reference('a gone one', { target: 'gone', broken: true }),
        text(' and '),
        reference('SPEC-7', {
          referenceType: 'external-document',
          baseline: JSON.stringify(BASELINE),
        }),
        note('n1', 'A note.'),
      ),
      attrs: { id: 'p-see' },
    },
  ]);
  const root = document.createElement('div');
  root.className = 'de-document-editor';
  return new EditorView(root, { state });
}

const body = (html: string) =>
  document.importNode(new DOMParser().parseFromString(html, 'text/html').body, true);

describe('print links', () => {
  it('DOCE-EDITOR-6.21 puts an anchor on each element with an element id, once', () => {
    const view = linkedView();
    const printed = body(documentSnapshot(view, { template: BASE_TEMPLATE }));
    expect(printed.querySelector('#h-scope')).toHaveTextContent('Scope');
    expect(printed.querySelector('#p-see')).toHaveAttribute('data-id', 'p-see');
    const ids = [...printed.querySelectorAll('[id]')].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    view.destroy();
  });

  it('DOCE-EDITOR-6.21 links internal references to their targets and leaves broken ones', () => {
    const view = linkedView();
    const printed = body(documentSnapshot(view, { template: BASE_TEMPLATE }));
    const link = printed.querySelector('a[data-print-link="reference"]');
    expect(link).toHaveAttribute('href', '#h-scope');
    expect(link).toHaveTextContent('the scope');
    expect(link?.parentElement).toHaveAttribute('data-reference', 'true');
    const broken = [...printed.querySelectorAll('[data-reference]')].find(
      (element) => element.textContent === 'a gone one',
    );
    expect(broken?.querySelector('a')).toBeNull();
    view.destroy();
  });

  it('DOCE-EDITOR-6.21 links citations where the host says, and not without it', () => {
    const view = linkedView();
    const cited: string[] = [];
    const linked = body(
      documentSnapshot(view, {
        template: BASE_TEMPLATE,
        citationHref: ({ refType, baseline }) => {
          cited.push(`${refType} ${baseline.documentId}`);
          return `https://example.test/documents/${baseline.documentId}`;
        },
      }),
    );
    expect(cited).toEqual(['external-document doc-7']);
    expect(linked.querySelector('a[data-print-link="citation"]')).toHaveAttribute(
      'href',
      'https://example.test/documents/doc-7',
    );
    const unlinked = body(documentSnapshot(view, { template: BASE_TEMPLATE }));
    expect(unlinked.querySelector('a[data-print-link="citation"]')).toBeNull();
    view.destroy();
  });

  it('DOCE-EDITOR-6.21 links each footnote marker to its entry and the entry back', () => {
    const view = linkedView();
    const printed = body(documentSnapshot(view, { template: BASE_TEMPLATE }));
    const marker = printed.querySelector('sup.footnote-reference');
    expect(marker).toHaveAttribute('id', 'fnref-n1');
    expect(marker?.querySelector('a')).toHaveAttribute('href', '#fn-n1');
    const entry = printed.querySelector('.pm-footnote-entry');
    expect(entry).toHaveAttribute('id', 'fn-n1');
    const back = entry?.querySelector('.pm-footnote-entry-number > a');
    expect(back).toHaveAttribute('href', '#fnref-n1');
    expect(back).toHaveAttribute('data-print-link', 'footnote-back');
    view.destroy();
  });

  it('DOCE-EDITOR-6.22 writes each numbered heading its number as static text', () => {
    const view = linkedView();
    const printed = body(documentSnapshot(view, { template: BASE_TEMPLATE }));
    expect(printed.querySelector('#h-scope')).toHaveAttribute('data-number', '1.');
    expect(printed.querySelector('#h-limits')).toHaveAttribute('data-number', '2.');
    expect(printed.querySelector('#p-see')).not.toHaveAttribute('data-number');
    view.destroy();
  });

  it('DOCE-EDITOR-6.21 prints links as their text, without the browser link style', () => {
    const view = linkedView();
    const html = documentSnapshot(view, { template: BASE_TEMPLATE });
    expect(html).toContain(
      '.de-snapshot a[data-print-link] { color: inherit; text-decoration: inherit; }',
    );
    view.destroy();
  });
});
