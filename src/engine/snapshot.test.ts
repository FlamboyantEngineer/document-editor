import { EditorState } from 'prosemirror-state';
import { Transform } from 'prosemirror-transform';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import {
  BASE_TEMPLATE,
  readDocumentFile,
  setPageRegions,
  type StoredNode,
  type TemplateFile,
} from '../model/index.js';
import { createPageVariables } from '../pagination/index.js';
import { documentSnapshot } from './snapshot.js';

const variable = (key: string): StoredNode => ({ type: 'variable', attrs: { key } });
const text = (value: string): StoredNode => ({ type: 'text', text: value });

const template: TemplateFile = {
  ...BASE_TEMPLATE,
  header: { content: [{ type: 'paragraph', content: [variable('document.name')] }] },
  footer: {
    content: [
      {
        type: 'paragraph',
        content: [
          text('Page '),
          variable('page.current'),
          text(' of '),
          variable('page.total'),
          text(', '),
          variable('date.current'),
        ],
      },
    ],
  },
};

// A view of one page with a header and footer, inside an editor root with the given hooks.
function snapshotView(rootData: Record<string, string>) {
  const stored = { formatVersion: 1, sections: [{ name: null, content: [] }] } as const;
  const doc = setPageRegions(new Transform(readDocumentFile(stored, documentSchema)), template).doc;
  const root = document.createElement('div');
  root.className = 'de-document-editor';
  for (const [name, value] of Object.entries(rootData)) root.setAttribute(`data-${name}`, value);
  const plugin = createPageVariables({
    value: (key) => (key === 'document.name' ? 'Interface notes' : undefined),
    locale: 'en-US',
    now: () => new Date(2026, 10, 11),
  });
  return new EditorView(root, { state: EditorState.create({ doc, plugins: [plugin] }) });
}

// The snapshot's body, adopted into the test's document so its elements are this window's.
function parse(html: string) {
  return {
    body: document.importNode(new DOMParser().parseFromString(html, 'text/html').body, true),
  };
}

describe('documentSnapshot', () => {
  it('DOCE-EDITOR-6.9 keeps the page numbers, totals, dates and host values of every region', () => {
    const view = snapshotView({ layout: 'page' });
    const snapshot = parse(documentSnapshot(view, { template }));
    expect(snapshot.body.querySelector('.pm-page-header')?.textContent).toBe('Interface notes');
    expect(snapshot.body.querySelector('.pm-page-footer')?.textContent).toBe(
      'Page 1 of 1, November 11, 2026',
    );
    expect(snapshot.body.querySelector('[contenteditable]')).toBeNull();
    view.destroy();
  });

  it('DOCE-EDITOR-6.9 wraps the pages in the editor root hooks, read only', () => {
    const view = snapshotView({ layout: 'page', mode: 'authoring', markup: 'all' });
    const snapshot = parse(documentSnapshot(view, { template }));
    const root = snapshot.body.firstElementChild;
    expect(root).toHaveClass('de-document-editor');
    expect(root).toHaveAttribute('data-layout', 'page');
    expect(root).toHaveAttribute('data-markup', 'all');
    expect(root).toHaveAttribute('data-mode', 'reading');
    expect(root?.querySelector('.pm-page')).not.toBeNull();
    view.destroy();
  });
});
