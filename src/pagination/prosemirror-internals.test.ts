// The ProseMirror internals the pages reach through casts (DOCE-PAGINATION-11.2): a
// `prosemirror-view` update that renames or reshapes one fails here, with its name, rather than
// silently through optional chaining or at run time.

import { EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { makeSet } from './forced-sets.js';

const doc = documentSchema.node('doc', null, [
  documentSchema.node('page_section', null, [
    documentSchema.node('page', null, [
      documentSchema.node('page_header'),
      documentSchema.node('page_content', null, [
        documentSchema.node('paragraph', null, documentSchema.text('Some words')),
      ]),
      documentSchema.node('page_footnotes'),
      documentSchema.node('page_footer'),
    ]),
  ]),
]);

describe('the ProseMirror internals the pages use', () => {
  it("DOCE-PAGINATION-11.2 builds a set from local decorations and children's sets (`makeSet`)", () => {
    const inner = new makeSet([Decoration.inline(0, 2, { class: 'inner' })], []);
    const outer = new makeSet([Decoration.node(0, 4, { class: 'outer' })], [1, 3, inner]);
    expect(outer).toBeInstanceOf(DecorationSet);
    // A child's set is relative to the child's content, which starts past the child's start.
    const found = outer.find().map((each) => [each.from, each.to]);
    expect(found).toEqual([
      [0, 4],
      [2, 4],
    ]);
  });

  it("DOCE-PAGINATION-11.2 reads a decoration's kind and attributes, and a widget's drawing", () => {
    const parts = (decoration: Decoration) =>
      decoration as unknown as { inline?: unknown; type?: { attrs?: unknown; toDOM?: unknown } };
    const inline = parts(Decoration.inline(1, 3, { class: 'a' }));
    const node = parts(Decoration.node(0, 4, { class: 'b' }));
    const widget = parts(Decoration.widget(1, () => document.createElement('span')));
    expect(inline.inline, 'Decoration.inline').toBe(true);
    expect(node.inline, 'Decoration.inline').toBe(false);
    expect(node.type?.attrs, 'Decoration.type.attrs').toEqual({ class: 'b' });
    expect(typeof widget.type?.toDOM, 'WidgetType.toDOM').toBe('function');
  });

  it("DOCE-PAGINATION-11.7 flushes the view's DOM reader and writes its selection", () => {
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({ doc }),
    });
    const observer = (view as unknown as { domObserver?: Record<string, unknown> }).domObserver;
    expect(typeof observer?.flush, 'EditorView.domObserver.flush').toBe('function');
    expect(typeof observer?.setCurSelection, 'EditorView.domObserver.setCurSelection').toBe(
      'function',
    );
    view.destroy();
  });
});
