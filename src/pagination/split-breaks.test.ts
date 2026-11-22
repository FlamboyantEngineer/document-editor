import { EditorState } from 'prosemirror-state';
import type { DecorationSet } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema, parseMarkup } from '../../test/document-markup.js';
import { splitBreaksPlugin } from './split-breaks.js';

const region = (name: string, inner = '') =>
  `<div class="pm-${name}" data-pm-${name}="true">${inner}</div>`;
const page = (content: string) =>
  `<div class="pm-page" data-pm-page="true">${region('page-header')}${region('page-content', content)}${region('page-footnotes')}${region('page-footer')}</div>`;
const section = (...pages: string[]) =>
  `<div class="pm-section" data-pm-section="true" data-section-name="Main">${pages.join('')}</div>`;

// The breaks the plugin hides, by the text after each.
function hidden(markup: string): string[] {
  const doc = parseMarkup(markup);
  const state = EditorState.create({ schema: documentSchema, doc, plugins: [splitBreaksPlugin()] });
  const set = state.plugins[0]?.getState(state) as DecorationSet;
  return set.find().map((each) => {
    expect(doc.nodeAt(each.from)?.type.name).toBe('hard_break');
    return doc.textBetween(each.to, doc.resolve(each.to).end(), '', '|');
  });
}

describe('split breaks', () => {
  it('DOCE-PAGINATION-3.6 hides the hard break a later fragment starts with', () => {
    const markup = section(
      page('<p data-id="p1" data-split-part-index="0">a<br>b</p>'),
      page('<p data-id="p1" data-split-part-index="1"><br>c<br>d</p><p data-id="p2"><br>e</p>'),
    );
    expect(hidden(markup)).toEqual(['c|d']);
  });

  it('DOCE-PAGINATION-3.6 keeps a break a whole paragraph or a first fragment starts with', () => {
    const markup = section(
      page('<p data-id="p1"><br>a</p>'),
      page('<p data-id="p2" data-split-part-index="0"><br>b</p>'),
    );
    expect(hidden(markup)).toEqual([]);
  });
});
