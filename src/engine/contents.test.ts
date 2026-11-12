import { EditorState } from 'prosemirror-state';
import { DecorationSet, EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import {
  BASE_TEMPLATE,
  readDocumentFile,
  type StoredNode,
  type TemplateFile,
} from '../model/index.js';
import { contentsCatalog, contentsKey, createContents } from './contents.js';

const heading = (level: number, text: string): StoredNode => ({
  type: 'heading',
  attrs: { level },
  content: [{ type: 'text', text }],
});

const TEMPLATE: TemplateFile = {
  ...BASE_TEMPLATE,
  styles: {
    ...BASE_TEMPLATE.styles,
    contents: {
      leader: { character: '.' },
      kinds: { toc: { title: 'Outline', levels: [null, { leader: { character: '-' } }] } },
    },
  },
};

let editor: EditorView | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function render(template: TemplateFile) {
  const doc = readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        { content: [{ type: 'contents' }, heading(1, 'Scope'), heading(2, 'Scope details')] },
      ],
    },
    documentSchema,
  ).doc;
  const state = EditorState.create({
    doc,
    plugins: [createContents({ template: () => template })],
  });
  editor = new EditorView(document.createElement('div'), { state });
  return editor.dom;
}

describe('lists of contents under a template', () => {
  it('DOCE-TEMPLATES-10.4 shows the template title and each level its leader', () => {
    const view = render(TEMPLATE);
    expect(view.querySelector('.de-contents__title')?.textContent).toBe('Outline');
    const leaders = [...view.querySelectorAll('.de-contents__leader')].map((leader) =>
      leader.textContent?.charAt(0),
    );
    expect(leaders).toEqual(['.', '-']);
  });

  it('DOCE-TEMPLATES-10.4 keeps the editor title and draws no leader for an empty character', () => {
    const view = render({
      ...TEMPLATE,
      styles: { ...TEMPLATE.styles, contents: { leader: { character: '' } } },
    });
    expect(view.querySelector('.de-contents__title')?.textContent).toBe('Table of Contents');
    expect(view.querySelectorAll('.de-contents__entry')).toHaveLength(2);
    expect(view.querySelector('.de-contents__leader')).toBeNull();
  });
});

const abbreviation: StoredNode = {
  type: 'abbreviation',
  attrs: { entry: 'g1', abbreviation: 'GSE', expansion: 'Ground support equipment' },
};

function viewOf(editable: boolean) {
  const doc = readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [
            { type: 'paragraph', content: [abbreviation] },
            { type: 'contents', attrs: { kind: 'abbreviations' } },
          ],
        },
      ],
    },
    documentSchema,
  ).doc;
  const state = EditorState.create({
    doc,
    plugins: [createContents({ template: () => BASE_TEMPLATE })],
  });
  return new EditorView(document.body.appendChild(document.createElement('div')), {
    state,
    editable: () => editable,
  });
}

const originalScroll = Element.prototype.scrollIntoView;

afterEach(() => {
  Element.prototype.scrollIntoView = originalScroll;
  document.body.replaceChildren();
});

describe('contents anchors', () => {
  it('DOCE-CONTENTS-2.6 gives each abbreviation entry its anchor, and an abbreviation goes to it', () => {
    const view = viewOf(false);
    const entry = view.dom.querySelector('.de-contents__entry');
    expect(entry).toHaveAttribute('id', 'abbr-g1');
    expect(view.dom.querySelector('a[href="#abbr-g1"]')).not.toBeNull();
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    let pos = -1;
    view.state.doc.descendants((node, at) => {
      if (node.type.name === 'abbreviation_reference') pos = at;
    });
    const event = new MouseEvent('click', { cancelable: true });
    const handled = view.someProp('handleClickOn', (handle) =>
      handle(view, pos, view.state.doc.nodeAt(pos) ?? view.state.doc, pos, event, true),
    );
    expect(handled).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe(entry);
    view.destroy();
  });

  it('DOCE-CONTENTS-2.6 leaves a plain click in an edited document to the caret', () => {
    const view = viewOf(true);
    let pos = -1;
    view.state.doc.descendants((each, at) => {
      if (each.type.name === 'abbreviation_reference') pos = at;
    });
    const event = new MouseEvent('click', { cancelable: true });
    const handled = view.someProp('handleClickOn', (handle) =>
      handle(view, pos, view.state.doc.nodeAt(pos) ?? view.state.doc, pos, event, true),
    );
    expect(handled).toBeFalsy();
    view.destroy();
  });
});

describe('contents on each keystroke', () => {
  it('DOCE-CONTENTS-2.7 draws no lists in a document without one, and catalogs it once asked', () => {
    const doc = readDocumentFile(
      { formatVersion: 1, sections: [{ content: [heading(1, 'Scope'), heading(2, 'Detail')] }] },
      documentSchema,
    ).doc;
    let state = EditorState.create({
      doc,
      plugins: [createContents({ template: () => BASE_TEMPLATE })],
    });
    let scope = 0;
    state.doc.descendants((node, pos) => {
      if (node.isText && node.text === 'Scope') scope = pos;
    });
    state = state.apply(state.tr.insertText('Wide ', scope));
    expect(contentsKey.getState(state)?.decorations).toBe(DecorationSet.empty);
    expect(contentsCatalog(state)?.toc?.map((entry) => entry.text)).toEqual([
      'Wide Scope',
      'Detail',
    ]);
    const listed = state.apply(state.tr.insert(scope - 1, documentSchema.node('toc_block')));
    expect(contentsKey.getState(listed)?.decorations.find()).toHaveLength(1);
  });
});
