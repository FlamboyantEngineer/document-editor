import { DOMParser, type Node } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it } from 'vitest';
import { documentSchema, findNode } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode, writeDocumentFile } from '../model/index.js';
import { isInChecklist, toggleChecklist, toggleItemChecked } from './checklists.js';
import { copiedText } from './clipboard-text.js';
import { createDocumentEditing } from './index.js';

const read = (...content: StoredNode[]) =>
  readDocumentFile({ formatVersion: 1, sections: [{ name: null, content }] }, documentSchema).doc;

const paragraph = (text = ''): StoredNode => ({
  type: 'paragraph',
  content: text ? [{ type: 'text', text }] : [],
});
const item = (text: string, checked?: boolean): StoredNode => ({
  type: 'listItem',
  ...(checked === undefined ? {} : { attrs: { checked } }),
  content: [paragraph(text)],
});
const bullets = (...items: StoredNode[]): StoredNode => ({ type: 'bulletList', content: items });

const views: EditorView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
});

// The end of the last textblock whose text is the one given.
function endOf(doc: Node, text: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (node.isTextblock && node.textContent === text) found = pos + node.nodeSize - 1;
    return true;
  });
  return found;
}

function viewOf(blocks: StoredNode[], at: string, editable = true): EditorView {
  const doc = read(...blocks);
  const state = EditorState.create({ doc, plugins: createDocumentEditing(documentSchema) });
  const place = document.createElement('div');
  document.body.append(place);
  const view = new EditorView(place, {
    state: state.apply(state.tr.setSelection(TextSelection.create(doc, endOf(doc, at)))),
    editable: () => editable,
  });
  views.push(view);
  return view;
}

// Each item of the document's lists as its text and checked state.
function items(doc: Node): string[] {
  const found: string[] = [];
  doc.descendants((node) => {
    if (node.type.name !== 'list_item') return true;
    const { checked } = node.attrs;
    found.push(`${checked === null ? '-' : checked ? 'x' : 'o'} ${node.textContent}`);
    return true;
  });
  return found;
}

function type(view: EditorView, typed: string): void {
  for (const char of typed) {
    const { from, to } = view.state.selection;
    const handled = view.someProp('handleTextInput', (handle) =>
      handle(view, from, to, char, () => view.state.tr.insertText(char, from, to)),
    );
    if (!handled) view.dispatch(view.state.tr.insertText(char, from, to));
  }
}

function press(view: EditorView, key: string, init: KeyboardEventInit = {}): boolean {
  const event = new KeyboardEvent('keydown', { key, ...init });
  return Boolean(view.someProp('handleKeyDown', (handle) => handle(view, event)));
}

const listType = documentSchema.nodes.bullet_list;
if (!listType) throw new Error('no bullet list');

describe('checklist items', () => {
  it('DOCE-SCHEMA-3.12 renders a checklist item with its box and stores checked only when set', () => {
    const view = viewOf([bullets(item('Tent', true), item('Rope'))], 'Tent');
    const [ticked, plain] = view.dom.querySelectorAll('li');
    expect(ticked?.getAttribute('data-checked')).toBe('true');
    expect(ticked?.querySelector(':scope > .de-task-box')?.getAttribute('contenteditable')).toBe(
      'false',
    );
    expect(ticked?.querySelector(':scope > .de-task-content > p')?.textContent).toBe('Tent');
    expect(plain?.hasAttribute('data-checked')).toBe(false);
    const stored = writeDocumentFile(view.state.doc).sections[0]?.content[0];
    expect(stored?.content?.map((entry) => entry.attrs?.checked)).toEqual([true, undefined]);
  });

  it('DOCE-SCHEMA-3.12 reads checklist items from markup and from a pasted checkbox', () => {
    const markup = document.createElement('div');
    markup.innerHTML =
      '<ul><li data-checked="false"><span class="de-task-box"></span><div class="de-task-content"><p>One</p></div></li>' +
      '<li><input type="checkbox" checked> Two</li><li>Three</li></ul>';
    const parsed = DOMParserOf().parse(markup);
    expect(items(parsed)).toEqual(['o One', 'x Two', '- Three']);
  });
});

// The schema's own markup parser.
const DOMParserOf = () => DOMParser.fromSchema(documentSchema);

describe('making checklists', () => {
  it('DOCE-EDITING-7.1 makes a list a checklist, keeping ticked items, and a checklist a list again', () => {
    const view = viewOf([bullets(item('Tent', true), item('Rope'))], 'Rope');
    expect(isInChecklist(view.state)).toBe(false);
    expect(toggleChecklist(listType)(view.state, view.dispatch)).toBe(true);
    expect(items(view.state.doc)).toEqual(['x Tent', 'o Rope']);
    expect(isInChecklist(view.state)).toBe(true);
    toggleChecklist(listType)(view.state, view.dispatch);
    expect(items(view.state.doc)).toEqual(['- Tent', '- Rope']);
  });

  it('DOCE-EDITING-7.1 makes a numbered list a bulleted checklist, and paragraphs a new one', () => {
    const numbered = viewOf([{ type: 'orderedList', content: [item('One')] }], 'One');
    toggleChecklist(listType)(numbered.state, numbered.dispatch);
    expect(findNode(numbered.state.doc, 'ordered_list')).toBeUndefined();
    expect(findNode(numbered.state.doc, 'bullet_list')).toBeDefined();
    expect(items(numbered.state.doc)).toEqual(['o One']);

    const loose = viewOf([paragraph('Tent')], 'Tent');
    expect(press(loose, '9', { ctrlKey: true, shiftKey: true })).toBe(true);
    expect(items(loose.state.doc)).toEqual(['o Tent']);
  });

  it('DOCE-EDITING-6.1 makes a checklist item from a typed box', () => {
    const clear = viewOf([paragraph()], '');
    type(clear, '[ ] Tent');
    expect(items(clear.state.doc)).toEqual(['o Tent']);

    const ticked = viewOf([paragraph()], '');
    type(ticked, '- [x] Rope');
    expect(items(ticked.state.doc)).toEqual(['x Rope']);
    expect(ticked.state.doc.childCount).toBe(1);
  });
});

describe('ticking items', () => {
  it('DOCE-EDITING-7.2 ticks and clears the item at the selection with Mod-Enter', () => {
    const view = viewOf([bullets(item('Tent', false))], 'Tent');
    expect(press(view, 'Enter', { ctrlKey: true })).toBe(true);
    expect(items(view.state.doc)).toEqual(['x Tent']);
    expect(toggleItemChecked(view.state, view.dispatch)).toBe(true);
    expect(items(view.state.doc)).toEqual(['o Tent']);

    const plain = viewOf([bullets(item('Rope'))], 'Rope');
    expect(toggleItemChecked(plain.state)).toBe(false);
  });

  it('DOCE-EDITING-7.2 ticks an item when its box is clicked, only while editable', () => {
    const click = (view: EditorView) => {
      const box = view.dom.querySelector('.de-task-box');
      const pos = view.posAtDOM(box?.parentElement ?? view.dom, 0) - 1;
      const node = view.state.doc.nodeAt(pos);
      const event = new MouseEvent('click', { bubbles: true });
      Object.defineProperty(event, 'target', { value: box });
      return view.someProp('handleClickOn', (handle) =>
        node ? handle(view, pos + 1, node, pos, event, true) : false,
      );
    };
    const view = viewOf([bullets(item('Tent', false))], 'Tent');
    expect(click(view)).toBe(true);
    expect(items(view.state.doc)).toEqual(['x Tent']);

    const locked = viewOf([bullets(item('Rope', false))], 'Rope', false);
    expect(click(locked)).toBe(true);
    expect(items(locked.state.doc)).toEqual(['o Rope']);
  });
});

describe('new checklist items', () => {
  it('DOCE-EDITING-7.3 adds a clear item on Enter after a ticked one', () => {
    const view = viewOf([bullets(item('Tent', true))], 'Tent');
    press(view, 'Enter');
    type(view, 'Rope');
    expect(items(view.state.doc)).toEqual(['x Tent', 'o Rope']);

    const plain = viewOf([bullets(item('Tent'))], 'Tent');
    press(plain, 'Enter');
    expect(items(plain.state.doc)).toEqual(['- Tent', '- ']);
  });

  it('DOCE-EDITING-7.3 copies checklist items as plain text led by their boxes', () => {
    const view = viewOf([bullets(item('Tent', true), item('Rope', false))], 'Rope');
    const { state } = view;
    const all = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, 1, state.doc.content.size - 1)),
    );
    expect(copiedText(all)).toBe('☒ Tent\n☐ Rope');
  });
});
