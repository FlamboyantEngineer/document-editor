import type { Node } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it } from 'vitest';
import { documentSchema, findNode } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import {
  createDocumentEditing,
  type DocumentEditingOptions,
  suggestTransaction,
  typedAsWritten,
} from './index.js';

const read = (...content: StoredNode[]) =>
  readDocumentFile({ formatVersion: 1, sections: [{ name: null, content }] }, documentSchema).doc;

const paragraph = (text = ''): StoredNode => ({
  type: 'paragraph',
  content: text ? [{ type: 'text', text }] : [],
});

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

// A view of the blocks with the caret at the end of the last block whose text is `at`.
function viewOf(blocks: StoredNode[], at = '', options: DocumentEditingOptions = {}): EditorView {
  const doc = read(...blocks);
  const state = EditorState.create({
    doc,
    plugins: createDocumentEditing(documentSchema, options),
  });
  const view = new EditorView(document.createElement('div'), {
    state: state.apply(state.tr.setSelection(TextSelection.create(doc, endOf(doc, at)))),
  });
  views.push(view);
  return view;
}

// Types the text a key at a time, as a writer would, through the plugins' text input handlers.
function type(view: EditorView, typed: string): void {
  for (const char of typed) {
    const { from, to } = view.state.selection;
    const handled = view.someProp('handleTextInput', (handle) =>
      handle(view, from, to, char, () => view.state.tr.insertText(char, from, to)),
    );
    if (!handled) view.dispatch(view.state.tr.insertText(char, from, to));
  }
}

function press(view: EditorView, key: string): boolean {
  const event = new KeyboardEvent('keydown', { key });
  return Boolean(view.someProp('handleKeyDown', (handle) => handle(view, event)));
}

// The body's blocks, each as its type and text, lists and quotes with their children.
function shape(doc: Node): unknown[] {
  const blocks: unknown[] = [];
  doc.descendants((node) => {
    if (node.isTextblock) {
      const attrs = node.type.name === 'heading' ? `${String(node.attrs.level)}` : '';
      blocks.push(`${node.type.name}${attrs}:${node.textContent}`);
      return false;
    }
    if (!node.isBlock || node.type.name.startsWith('page') || node.type.name === 'doc') return true;
    blocks.push(node.type.name);
    return true;
  });
  return blocks;
}

// A document's text, its blocks run together.
const textOf = (doc: Node) => doc.textContent;

// Each text run of the first textblock with the names of its marks.
function runs(doc: Node): string[] {
  const parts: string[] = [];
  doc.descendants((node) => {
    if (node.isText) {
      const marks = node.marks
        .map((mark) => mark.type.name)
        .filter((name) => name !== 'contributor');
      parts.push(marks.length ? `${marks.join('+')}(${node.text ?? ''})` : (node.text ?? ''));
    }
    return true;
  });
  return parts;
}

describe('typing shortcuts', () => {
  it('DOCE-EDITING-6.1 turns a paragraph into a heading of the level typed', () => {
    const view = viewOf([paragraph()]);
    type(view, '### Scope');
    expect(shape(view.state.doc)).toEqual(['heading3:Scope']);
  });

  it('DOCE-EDITING-6.1 wraps a paragraph in a list, a numbered list or a quote', () => {
    const bullets = viewOf([paragraph()]);
    type(bullets, '- First');
    expect(shape(bullets.state.doc)).toEqual(['bullet_list', 'list_item', 'paragraph:First']);

    const numbers = viewOf([paragraph()]);
    type(numbers, '3. Third');
    expect(shape(numbers.state.doc)).toEqual(['ordered_list', 'list_item', 'paragraph:Third']);
    expect(findNode(numbers.state.doc, 'ordered_list')?.attrs.order).toBe(3);

    const quote = viewOf([paragraph()]);
    type(quote, '> Said');
    expect(shape(quote.state.doc)).toEqual(['blockquote', 'paragraph:Said']);
  });

  it('DOCE-EDITING-6.1 makes a code block and a horizontal rule', () => {
    const code = viewOf([paragraph()]);
    type(code, '``` x');
    expect(shape(code.state.doc)).toEqual(['code_block:x']);

    const rule = viewOf([paragraph('Above'), paragraph()]);
    type(rule, '---');
    expect(shape(rule.state.doc)).toEqual(['paragraph:Above', 'horizontal_rule', 'paragraph:']);
    type(rule, 'Below');
    expect(shape(rule.state.doc)).toEqual([
      'paragraph:Above',
      'horizontal_rule',
      'paragraph:Below',
    ]);
  });

  it('DOCE-EDITING-6.1 leaves a heading or code typed with a block mark as typed', () => {
    const heading = viewOf([{ type: 'heading', attrs: { level: 1 }, content: [] }]);
    type(heading, '- x');
    expect(shape(heading.state.doc)).toEqual(['heading1:- x']);

    const code = viewOf([{ type: 'code_block', content: [] }]);
    type(code, '# a **b** -- "c"');
    expect(shape(code.state.doc)).toEqual(['code_block:# a **b** -- "c"']);
  });

  it('DOCE-EDITING-6.2 wraps delimited text in its mark once the closing delimiter is typed', () => {
    const view = viewOf([paragraph()]);
    type(view, 'a **b** *c* _d_ ~~e~~ `f`');
    expect(runs(view.state.doc)).toEqual([
      'a ',
      'strong(b)',
      ' ',
      'em(c)',
      ' ',
      'em(d)',
      ' ',
      'strike(e)',
      ' ',
      'code(f)',
    ]);
  });

  it('DOCE-EDITING-6.2 leaves the text typed after a closed mark without it', () => {
    const view = viewOf([paragraph()], '', { author: () => 'writer' });
    type(view, '**b** after');
    expect(runs(view.state.doc)).toEqual(['strong(b)', ' after']);
  });

  it('DOCE-EDITING-6.2 leaves snake_case words and spaced delimiters as typed', () => {
    const view = viewOf([paragraph()]);
    type(view, 'snake_case_name 2 * 3 * 4');
    expect(runs(view.state.doc)).toEqual(['snake_case_name 2 * 3 * 4']);
  });

  it('DOCE-EDITING-6.3 types quotes, dashes, the ellipsis, arrows and symbols', () => {
    const view = viewOf([paragraph()]);
    type(view, `"Hi" it's -- wait... -> <- <-> => (c) (tm) +- != <= >=`);
    expect(textOf(view.state.doc)).toBe('“Hi” it’s — wait… → ← ↔ ⇒ © ™ ± ≠ ≤ ≥');
  });

  it('DOCE-EDITING-6.4 takes the last shortcut back on Backspace', () => {
    const view = viewOf([paragraph()]);
    type(view, '## ');
    expect(shape(view.state.doc)).toEqual(['heading2:']);
    expect(press(view, 'Backspace')).toBe(true);
    expect(shape(view.state.doc)).toEqual(['paragraph:## ']);

    const dash = viewOf([paragraph()]);
    type(dash, 'a--');
    press(dash, 'Backspace');
    expect(textOf(dash.state.doc)).toBe('a--');
  });

  it('DOCE-EDITING-6.5 runs only the groups the host leaves on', () => {
    const none = viewOf([paragraph()], '', { typingRules: false });
    type(none, '# a -- **b**');
    expect(shape(none.state.doc)).toEqual(['paragraph:# a -- **b**']);

    const typography = viewOf([paragraph()], '', { typingRules: { blocks: false, marks: false } });
    type(typography, '# a -- **b**');
    expect(shape(typography.state.doc)).toEqual(['paragraph:# a — **b**']);
  });

  it('DOCE-EDITING-6.6 gives the text as typed for a shortcut that cannot be kept', () => {
    const view = viewOf([paragraph('-')], '-');
    const before = view.state;
    const { from, to } = before.selection;
    let made = null as ReturnType<typeof typedAsWritten>;
    const dispatch = view.dispatch.bind(view);
    view.dispatch = (tr) => {
      made ??= typedAsWritten(tr, before);
      dispatch(tr);
    };
    view.someProp('handleTextInput', (handle) =>
      handle(view, from, to, ' ', () => before.tr.insertText(' ', from, to)),
    );
    expect(shape(view.state.doc)).toEqual(['bullet_list', 'list_item', 'paragraph:']);
    expect(made).not.toBeNull();
    const typed = before.apply(made ?? before.tr);
    expect(shape(typed.doc)).toEqual(['paragraph:- ']);
    expect(typedAsWritten(before.tr.insertText('x', from), before)).toBeNull();
    // The writer's own text, typed as written, is what a suggestion records.
    const suggested = suggestTransaction(made ?? before.tr, before, { author: 'writer' });
    expect(suggested && textOf(before.apply(suggested).doc)).toBe('- ');
  });
});
