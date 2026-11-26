// The texts a document stores for its variables, refreshed as an edit (DOCE-PAGINATION-8.8).

import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import {
  BASE_TEMPLATE,
  readDocumentFile,
  setPageRegions,
  type StoredNode,
  storedValues,
  type TemplateFile,
} from '../model/index.js';
import {
  createDocumentValues,
  documentValueKeys,
  insertVariable,
  refreshDocumentValues,
  refreshedValues,
} from './index.js';

const text = (value: string): StoredNode => ({ type: 'text', text: value });
const variable = (key: string): StoredNode => ({ type: 'variable', attrs: { key } });
const block = (source: string): StoredNode => ({ type: 'templateBlock', attrs: { source } });

// A template whose header names the document's owner and whose footer counts the pages.
const TEMPLATE: TemplateFile = {
  ...BASE_TEMPLATE,
  header: { content: [{ type: 'paragraph', content: [variable('document.owner')] }] },
  footer: { content: [{ type: 'paragraph', content: [variable('page.current')] }] },
};

function documentOf(values?: Record<string, string>, language?: string) {
  const content: StoredNode[] = [
    {
      type: 'paragraph',
      content: [text('By '), variable('document.name'), variable('page.total')],
    },
    { type: 'paragraph', content: [variable('date.current')] },
    block('<p>{{document.title}}</p>'),
  ];
  const { doc } = readDocumentFile(
    { formatVersion: 1, values, language, sections: [{ name: null, content }] },
    documentSchema,
  );
  return setPageRegions(EditorState.create({ doc }).tr, TEMPLATE).doc;
}

const HOST = {
  'document.name': 'Interface notes',
  'document.title': 'Timing',
  'document.owner': 'Ada',
};
const source = {
  value: (key: string) => HOST[key as keyof typeof HOST],
  now: () => new Date(2026, 10, 26),
  template: TEMPLATE,
};

describe('document values', () => {
  it('DOCE-PAGINATION-8.8 finds the keys of the text, the regions and template blocks, not the page numbers', () => {
    expect(documentValueKeys(documentOf()).sort()).toEqual([
      'date.current',
      'document.name',
      'document.owner',
      'document.title',
    ]);
  });

  it('DOCE-PAGINATION-8.8 writes every key again, today in the document language, as one edit', () => {
    const state = EditorState.create({ doc: documentOf({ 'document.name': 'Old name' }, 'en-GB') });
    let next = state;
    expect(refreshDocumentValues(source)(state, (tr) => (next = state.apply(tr)))).toBe(true);
    expect(storedValues(next.doc)).toEqual({
      ...HOST,
      'date.current': '26 November 2026',
    });
    // Up to date, it changes nothing.
    expect(refreshDocumentValues(source)(next)).toBe(false);
    // In the template language when the document names none, else as the host asks.
    const american = refreshedValues(documentOf(), {
      ...source,
      template: { ...TEMPLATE, language: 'en-US' },
    });
    expect(american['date.current']).toBe('November 26, 2026');
    expect(refreshedValues(documentOf(), { ...source, locale: 'fr' })['date.current']).toBe(
      '26 novembre 2026',
    );
  });

  it('DOCE-PAGINATION-8.8 fills only the keys a document stores no text for, keeping the others', () => {
    const doc = documentOf({ 'document.name': 'Kept', 'date.current': 'Yesterday' });
    expect(refreshedValues(doc, source, 'missing')).toEqual({
      'document.name': 'Kept',
      'date.current': 'Yesterday',
      'document.title': 'Timing',
      'document.owner': 'Ada',
    }); // A key the host gives no text for stores none.
    expect(refreshedValues(documentOf(), { template: TEMPLATE, now: source.now }, 'all')).toEqual({
      'date.current': 'November 26, 2026',
    });
  });

  it('DOCE-PAGINATION-8.8 stores the text of a variable a writer adds, in the same change', () => {
    const plugin = createDocumentValues(() => source);
    let state = EditorState.create({ doc: documentOf(), plugins: [plugin] });
    // Opening asks nothing.
    expect(storedValues(state.doc)).toEqual({});
    let start = -1;
    state.doc.descendants((node, pos) => {
      if (node.isText && start < 0) start = pos;
    });
    state = state.apply(state.tr.insertText('Note: ', start));
    expect(storedValues(state.doc)).toEqual({});
    insertVariable('document.name')(state, (tr) => {
      state = state.applyTransaction(tr).state;
    });
    expect(storedValues(state.doc)['document.name']).toBe('Interface notes');
    // A change out of the history, as another writer's, is left as it came.
    const remote = EditorState.create({ doc: documentOf(), plugins: [plugin] });
    const placed = remote.tr.insert(1, documentSchema.text('x'));
    const shared = remote.applyTransaction(placed.setMeta('addToHistory', false)).state;
    expect(storedValues(shared.doc)).toEqual({});
  });
});
