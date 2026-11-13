import { Fragment, type Node as ProseMirrorNode, Slice } from 'prosemirror-model';
import { EditorState, type Plugin, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema, parseMarkup } from '../../test/document-markup.js';
import { installEditorDom } from '../../test/editor-dom.js';
import { caretAt, footnoteParts, footnoteState, note } from '../../test/footnote-fixtures.js';
import { BASE_TEMPLATE, readDocumentFile, type StoredNode } from '../model/index.js';
import { createClipboard, type PasteFilter } from './clipboard.js';
import { copiedText } from './clipboard-text.js';
import { createContents } from './contents.js';
import { createElementIds } from './element-ids.js';
import { createFootnotes } from './footnotes.js';

installEditorDom();

const text = (value: string): StoredNode => ({ type: 'text', text: value });
const paragraph = (...content: StoredNode[]): StoredNode => ({ type: 'paragraph', content });
const heading = (level: number, value: string): StoredNode => ({
  type: 'heading',
  attrs: { level },
  content: [text(value)],
});
const item = (value: string): StoredNode => ({
  type: 'list_item',
  content: [paragraph(text(value))],
});

const read = (...content: StoredNode[]) =>
  readDocumentFile({ formatVersion: 1, sections: [{ name: null, content }] }, documentSchema).doc;

// The position of a text's first character, or of the character `offset` after it.
function at(doc: ProseMirrorNode, value: string, offset = 0): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(value)) {
      found = pos + (node.text.indexOf(value) || 0) + offset;
    }
    return found < 0;
  });
  return found;
}

function viewOf(doc: ProseMirrorNode, plugins: Plugin[], caret: string) {
  const state = EditorState.create({ doc, plugins });
  const view = new EditorView(document.createElement('div'), {
    state: state.apply(state.tr.setSelection(TextSelection.create(doc, at(doc, caret)))),
  });
  return view;
}

// jsdom has no clipboard events; a plain event stands in for the one a paste sends.
const pasteEvent = () => new Event('paste') as unknown as ClipboardEvent;
const pasteHtml = (view: EditorView, html: string) => view.pasteHTML(html, pasteEvent());
const pasteText = (view: EditorView, value: string) => view.pasteText(value, pasteEvent());

// The document's body blocks as `type:text`.
function blocks(doc: ProseMirrorNode): string[] {
  const found: string[] = [];
  doc.descendants((node) => {
    if (node.isTextblock) found.push(`${node.type.name}:${node.textContent}`);
    return !node.isTextblock;
  });
  return found;
}

function marksOf(doc: ProseMirrorNode): string[] {
  const names = new Set<string>();
  doc.descendants((node) => {
    for (const mark of node.marks) names.add(mark.type.name);
  });
  return [...names];
}

const REVIEWED =
  '<p data-id="aaaa0001" data-au="ada"><mark data-comment-id="c1">Noted</mark> ' +
  '<ins data-id="s1" data-au="bea">added</ins><del data-id="s2" data-au="bea">gone</del> ' +
  '<span data-signature="ada" data-signature-name="Ada"></span>end</p>';

describe('the paste pipeline', () => {
  it('DOCE-EDITING-5.1 runs the registered filters in order, with the state at the paste', () => {
    const seen: string[] = [];
    const filter =
      (name: string): PasteFilter =>
      (slice, state) => {
        seen.push(`${name}:${state.selection.$from.parent.textContent}`);
        return slice;
      };
    const view = viewOf(
      read(paragraph(text('Target'))),
      [createClipboard({ filters: [filter('first'), filter('second')] })],
      'Target',
    );
    pasteHtml(view, '<p>Pasted</p>');
    expect(seen).toEqual(['first:Target', 'second:Target']);
    expect(blocks(view.state.doc)).toEqual(['paragraph:PastedTarget']);
    view.destroy();
  });

  it('DOCE-EDITING-5.1 fits what is pasted into a footnote entry to the entry, as its filter does', () => {
    const start = caretAt(footnoteState([paragraph(text('Body'), note('n1', 'Entry'))]), 'Entry');
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({
        doc: start.doc,
        selection: start.selection,
        plugins: [createFootnotes(), createClipboard()],
      }),
    });
    pasteHtml(view, '<h2>One</h2><p>Two</p>');
    expect(footnoteParts(view.state)).toEqual(['marker:n1', 'entry:n1:One TwoEntry']);
    view.destroy();
  });

  it('DOCE-EDITING-5.2 pastes a copy: new ids, no review marks, no deleted text, no signatures', () => {
    let next = 0;
    const view = viewOf(
      read(paragraph(text('Target'))),
      [
        createClipboard(),
        createElementIds({ author: () => 'cy', newId: () => `bbbb000${String((next += 1))}` }),
      ],
      'Target',
    );
    pasteHtml(view, `${REVIEWED}<p data-id="aaaa0002" data-au="ada">Second</p>`);
    expect(blocks(view.state.doc)).toEqual(['paragraph:Noted added end', 'paragraph:SecondTarget']);
    expect(marksOf(view.state.doc)).toEqual([]);
    const kept: unknown[] = [];
    view.state.doc.descendants((node) => {
      if (node.type.name === 'signature' || node.attrs.dataAuthor === 'ada') kept.push(node.attrs);
    });
    expect(kept).toEqual([]);
    view.destroy();
  });

  it('DOCE-EDITING-5.2 keeps content dragged within the document as it is, and still filters it', () => {
    const doc = read(paragraph(text('Target')));
    let filtered = 0;
    const clipboard = createClipboard({
      filters: [
        (slice) => {
          filtered += 1;
          return slice;
        },
      ],
    });
    const view = viewOf(doc, [clipboard], 'Target');
    const source = new EditorView(document.createElement('div'), {
      state: EditorState.create({
        doc: readDocumentFile(
          { formatVersion: 1, sections: [{ name: null, content: [] }] },
          documentSchema,
        ).doc,
      }),
    });
    pasteHtml(source, REVIEWED);
    const slice = new Slice(Fragment.from(source.state.doc.firstChild ?? []), 0, 0);
    const transform = (moves: boolean) => {
      view.dragging = { slice, move: moves };
      const event = Object.assign(new Event('drop'), { clientX: 0, clientY: 0, ctrlKey: !moves });
      clipboard.props.handleDOMEvents?.drop?.call(clipboard, view, event as DragEvent);
      return clipboard.props.transformPasted?.call(clipboard, slice, view, false);
    };
    expect(transform(true)).toBe(slice);
    const copied = transform(false);
    expect(copied).not.toBe(slice);
    expect(copied?.content.textBetween(0, copied.content.size)).not.toContain('gone');
    expect(filtered).toBe(2);
    view.destroy();
    source.destroy();
  });

  it('DOCE-EDITING-5.3 reads pasted plain text one paragraph per line, keeping empty lines', () => {
    const view = viewOf(read(paragraph(text('Target'))), [createClipboard()], 'Target');
    pasteText(view, 'One\r\n\r\nTwo\n');
    expect(blocks(view.state.doc)).toEqual([
      'paragraph:One',
      'paragraph:',
      'paragraph:Two',
      'paragraph:Target',
    ]);
    view.destroy();
  });

  it('DOCE-EDITING-5.3 DOCE-SUGGESTIONS-1.8 pastes plain text with the formatting at the caret, outside the suggestion there', () => {
    const struck = parseMarkup(
      '<p data-id="aaaa0001">Keep <strong><del data-id="s2" data-au="bea">gone</del></strong> rest</p>',
    );
    const view = viewOf(struck, [createClipboard()], 'gone');
    view.dispatch(view.state.tr.setSelection(TextSelection.create(struck, at(struck, 'gone', 2))));
    pasteText(view, 'new');
    expect(blocks(view.state.doc)).toEqual(['paragraph:Keep gonewne rest']);
    const pasted: string[] = [];
    view.state.doc.descendants((node) => {
      if (node.text === 'new') pasted.push(...node.marks.map((mark) => mark.type.name));
    });
    expect(pasted).toEqual(['strong']);
    view.destroy();
  });

  it('DOCE-FORMAT-6.2 cleans pasted word processor HTML, its tracked changes accepted', () => {
    const view = viewOf(read(paragraph(text('Target'))), [createClipboard()], 'Target');
    pasteHtml(
      view,
      '<p class="MsoNormal">Kept <ins cite="mailto:a">new</ins><del cite="mailto:a">old</del>' +
        '<span class="MsoCommentReference"><a class="msocomanchor" href="#_msocom_1">[A1]</a></span></p>' +
        '<div style="mso-element:comment-list"><div style="mso-element:comment"><p class="MsoCommentText">Remark</p></div></div>',
    );
    expect(blocks(view.state.doc)).toEqual(['paragraph:Kept newTarget']);
    expect(marksOf(view.state.doc)).toEqual([]);
    view.destroy();
  });
});

describe('copied text', () => {
  const doc = read(
    heading(1, 'Scope'),
    paragraph(text('Body')),
    heading(2, 'Detail'),
    { type: 'ordered_list', attrs: { start: 3 }, content: [item('Third'), item('Fourth')] },
    {
      type: 'bullet_list',
      content: [
        {
          type: 'list_item',
          content: [paragraph(text('Point')), { type: 'bullet_list', content: [item('Inner')] }],
        },
      ],
    },
    { type: 'toc_block', attrs: { kind: 'toc' } },
    heading(1, 'Annex'),
  );
  const template = () => BASE_TEMPLATE;

  const select = (from: number, to: number, plugins: Plugin[] = []) => {
    const state = EditorState.create({ doc, plugins });
    return state.apply(state.tr.setSelection(TextSelection.create(doc, from, to)));
  };

  it('DOCE-EDITING-5.4 carries heading and list numbers, one line for each block', () => {
    const state = select(at(doc, 'Scope'), at(doc, 'Inner', 5));
    expect(copiedText(state, { template }).split('\n')).toEqual([
      '1. Scope',
      'Body',
      '1.1. Detail',
      '3. Third',
      '4. Fourth',
      '• Point',
      '\t• Inner',
    ]);
    expect(copiedText(state).split('\n')[0]).toBe('Scope');
  });

  it('DOCE-EDITING-5.4 leaves the number off a block copied from its middle, or from within it', () => {
    expect(copiedText(select(at(doc, 'Scope', 2), at(doc, 'Body', 4)), { template })).toBe(
      'ope\nBody',
    );
    expect(copiedText(select(at(doc, 'Third'), at(doc, 'Third', 5)), { template })).toBe('Third');
  });

  it('DOCE-EDITING-5.4 copies a list of contents as its rows, leaders as a tab', () => {
    const state = select(at(doc, 'Inner'), at(doc, 'Annex', 5), [createContents({ template })]);
    expect(copiedText(state, { template }).split('\n')).toEqual([
      '\t• Inner',
      '2. Annex\t1',
      '2. Annex',
    ]);
  });
});
