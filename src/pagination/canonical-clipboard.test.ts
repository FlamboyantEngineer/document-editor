import type { Node as ProseMirrorNode, Slice } from 'prosemirror-model';
import { type EditorState, Plugin, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import {
  canonicalState,
  mount,
  pageCount,
  positionOf,
  textOf,
} from '../../test/projection-fixtures.js';

// A canonical state whose page header and footer hold text, as a template's do.
function withChrome(state: EditorState): EditorState {
  const tr = state.tr;
  const fill = (name: string, text: string) => {
    tr.doc.descendants((node, pos) => {
      if (node.type.name !== name) return node.type.name !== 'page_content';
      tr.insert(pos + 1, documentSchema.node('paragraph', null, [documentSchema.text(text)]));
      return false;
    });
  };
  fill('page_footer', 'Foot');
  fill('page_header', 'Head');
  return state.apply(tr.setMeta('addToHistory', false));
}

// Selects from one text to the end of another on the pages, as a drag across them does.
function selectOnPages(view: EditorView, from: string, to: string) {
  const { doc } = view.state;
  const anchor = positionOf(doc, from);
  const head = positionOf(doc, to) + to.length;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, anchor, head)));
}

function typesIn(slice: Slice): Set<string> {
  const names = new Set<string>();
  slice.content.descendants((node) => {
    names.add(node.type.name);
  });
  return names;
}

const pagesIn = (doc: ProseMirrorNode) => {
  let pages = 0;
  doc.descendants((node) => {
    if (node.type.name === 'page') pages += 1;
    return node.type.name === 'doc' || node.type.name === 'page_section';
  });
  return pages;
};

afterEach(() => {
  document.body.replaceChildren();
});

describe('the clipboard on the pages', () => {
  it('DOCE-PAGINATION-7.11 copies the canonical content of a selection that crosses a page break', () => {
    const { projection } = mount({ state: withChrome(canonicalState()) });
    const { view } = projection;
    expect(pageCount(view.state.doc)).toBe(3);
    selectOnPages(view, 'two', 'Gamma');
    const copied = view.serializeForClipboard(view.state.selection.content());
    expect(copied.text).toBe('two\n\nGamma');
    expect(pagesIn(copied.slice.content.firstChild ?? view.state.doc)).toBeLessThan(2);
    expect(typesIn(copied.slice).has('page_footer')).toBe(false);
    expect(copied.dom.querySelectorAll('p')).toHaveLength(2);
  });

  it('DOCE-PAGINATION-7.11 pastes what was copied across a page break into one page a section', () => {
    const { projection, drain } = mount({ state: withChrome(canonicalState()) });
    const { view } = projection;
    selectOnPages(view, 'two', 'Gamma');
    const { dom } = view.serializeForClipboard(view.state.selection.content());
    const end = positionOf(view.state.doc, 'five') + 'five'.length;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, end)));
    // jsdom has no ClipboardEvent, and a paste reads none of the event here.
    view.pasteHTML(dom.innerHTML, new Event('paste') as ClipboardEvent);
    drain();
    expect(pageCount(projection.state.doc)).toBe(1);
    expect(textOf(projection.state.doc)).toContain('Epsilon fivetwo');
    expect(textOf(projection.state.doc).match(/Head|Foot/g)).toHaveLength(2);
    expect(projection.layoutState()).not.toBe('failed');
  });

  it('DOCE-PAGINATION-7.11 takes a pasted slice that holds pages as the blocks of their content', () => {
    const { projection, drain } = mount({ state: withChrome(canonicalState()) });
    const { view } = projection;
    const from = positionOf(view.state.doc, 'two');
    const to = positionOf(view.state.doc, 'Gamma') + 'Gamma'.length;
    // What another view of pages, or an older copy, put on the clipboard.
    let slice = view.state.doc.slice(from, to, true);
    expect(pagesIn(slice.content.firstChild ?? view.state.doc)).toBe(2);
    view.someProp('transformPasted', (transform) => {
      slice = transform(slice, view, false);
    });
    const end = positionOf(view.state.doc, 'five') + 'five'.length;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, end)));
    const pasted = view.someProp('handlePaste', (handle) =>
      handle(view, new Event('paste') as ClipboardEvent, slice),
    );
    drain();
    expect(pasted).toBe(true);
    expect(pageCount(projection.state.doc)).toBe(1);
    expect(textOf(projection.state.doc).match(/Head|Foot/g)).toHaveLength(2);
    expect(projection.layoutState()).not.toBe('failed');
  });

  it('DOCE-PAGINATION-7.15 has the canonical plugins transform what is copied and write its text', () => {
    const seen: { slice: Slice; state: EditorState }[] = [];
    const clipboard = new Plugin({
      props: {
        transformCopied(slice, view) {
          seen.push({ slice, state: view.state });
          return slice;
        },
        clipboardTextSerializer: (slice, view) =>
          slice.eq(view.state.selection.content()) ? 'the canonical text' : '',
      },
    });
    const { projection } = mount({ state: canonicalState([clipboard]) });
    const { view } = projection;
    selectOnPages(view, 'two', 'Gamma');
    const copied = view.serializeForClipboard(view.state.selection.content());
    expect(copied.text).toBe('the canonical text');
    expect(seen).toHaveLength(1);
    expect(seen[0]?.state).toBe(projection.state);
    expect(seen[0]?.slice.eq(projection.state.selection.content())).toBe(true);
  });
});
