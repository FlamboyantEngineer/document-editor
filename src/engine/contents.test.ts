import { EditorState, NodeSelection } from 'prosemirror-state';
import { DecorationSet, EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import {
  BASE_TEMPLATE,
  readDocumentFile,
  type StoredNode,
  type TemplateFile,
} from '../model/index.js';
import { contentsCatalog, contentsGroupsAt, contentsKey, createContents } from './contents.js';
import { setContentsGroups } from './contents-commands.js';

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
      kinds: { toc: { customTitle: 'Outline', levels: [null, { leader: { character: '-' } }] } },
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
      (leader as HTMLElement).dataset.leader?.charAt(0),
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

describe('drawing a list', () => {
  it("DOCE-CONTENTS-2.8 carries its kind's properties and each row its level's", () => {
    const view = render({
      ...TEMPLATE,
      styles: {
        ...TEMPLATE.styles,
        contents: {
          entry: { size: '11pt' },
          kinds: { toc: { padding: { left: '4pt' }, levels: [{ weight: 700 }, { italic: true }] } },
        },
      },
    });
    const list = view.querySelector<HTMLElement>('.de-contents');
    expect(list?.style.getPropertyValue('--doc-contents-padding-left')).toBe('4pt');
    expect(list?.style.getPropertyValue('--doc-contents-entry-font-size')).toBe('11pt');
    const [first, second] = view.querySelectorAll<HTMLElement>('.de-contents__entry');
    expect(first?.style.getPropertyValue('--doc-contents-level-font-weight')).toBe('700');
    expect(second?.style.getPropertyValue('--doc-contents-level-font-style')).toBe('italic');
    expect(second?.style.getPropertyValue('--doc-contents-level-font-weight')).toBe('');
    // The leader is drawn from its attribute: the row's text holds a space in its place.
    const leader = first?.querySelector<HTMLElement>('.de-contents__leader');
    expect(leader?.dataset.leader?.startsWith('...')).toBe(true);
    expect(first?.textContent).toMatch(/^1\.Scope \d+$/);
  });
});

describe('choosing an entry', () => {
  it('DOCE-CONTENTS-2.4 reaches the entries with the keyboard and goes to one on Enter or Space', () => {
    const view = render(TEMPLATE);
    const entries = [...view.querySelectorAll<HTMLElement>('.de-contents__entry')];
    expect(entries.map((entry) => entry.tabIndex)).toEqual([0, -1]);
    const key = (target: HTMLElement, name: string) =>
      target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
    const [first, second] = entries;
    if (!first || !second || !editor) throw new Error('Two entries');
    key(first, 'ArrowDown');
    expect(entries.map((entry) => entry.tabIndex)).toEqual([-1, 0]);
    key(second, 'Enter');
    expect(String(editor.state.selection.$from.parent.textContent)).toBe('Scope details');
    key(second, 'ArrowUp');
    key(first, ' ');
    expect(String(editor.state.selection.$from.parent.textContent)).toBe('Scope');
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

  it('DOCE-CONTENTS-2.9 counts the document again only for a change past a text edit', () => {
    const doc = readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            content: [
              { type: 'contents' },
              heading(1, 'Scope'),
              { type: 'paragraph', content: [{ type: 'text', text: 'Body' }] },
            ],
          },
        ],
      },
      documentSchema,
    ).doc;
    let state = EditorState.create({
      doc,
      plugins: [createContents({ template: () => BASE_TEMPLATE })],
    });
    const builds = () => {
      const value = contentsKey.getState(state);
      expect(value?.decorations.find()).toHaveLength(1);
      return value?.builds;
    };
    // Where the text of the first block of a type starts.
    const at = (type: string) => {
      let found = 0;
      state.doc.descendants((node, pos) => {
        if (!found && node.type.name === type) found = pos + 1;
        return !found;
      });
      return found;
    };
    const first = builds();
    for (const [index, letter] of [...'Wide '].entries()) {
      state = state.apply(state.tr.insertText(letter, at('heading') + index));
      state = state.apply(state.tr.insertText(letter, at('paragraph')));
      expect(builds()).toBe(first);
    }
    expect(contentsCatalog(state)?.toc?.map((entry) => entry.text)).toEqual(['Wide Scope']);
    state = state.apply(state.tr.split(at('paragraph') + 2));
    expect(builds()).toBe((first ?? 0) + 1);
  });
});

describe('two lists of one kind', () => {
  it('DOCE-CONTENTS-2.6 gives an anchor to the first list’s row alone', () => {
    const doc = readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [
              { type: 'paragraph', content: [abbreviation] },
              { type: 'contents', attrs: { kind: 'abbreviations' } },
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
    const view = new EditorView(document.body.appendChild(document.createElement('div')), {
      state,
    });
    const entries = [...view.dom.querySelectorAll('.de-contents__entry')];
    expect(entries.map((entry) => entry.id)).toEqual(['abbr-g1', '']);
    view.destroy();
  });
});

describe('a list of references', () => {
  const baseline = (documentId: string) =>
    JSON.stringify({
      version: 1,
      documentId,
      numbering: documentId,
      title: documentId,
      revision: null,
      revisionLabel: '',
      target: null,
      defaultLabel: documentId,
    });
  const cite = (value: string, attrs: Record<string, unknown>): StoredNode => ({
    type: 'text',
    text: value,
    marks: [{ type: 'reference', attrs }],
  });

  function referencesView(options: { href?: boolean; filter?: string } = {}) {
    const doc = readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [
              {
                type: 'contents',
                attrs: {
                  kind: 'references',
                  ...(options.filter ? { referenceFilter: options.filter } : {}),
                },
              },
              {
                type: 'paragraph',
                content: [
                  cite('the catalogue entry', {
                    referenceType: 'catalogue-entry',
                    number: 'C-1',
                    title: 'Catalogued',
                    target: 'c1',
                  }),
                  { type: 'text', text: ' and ' },
                  cite('the handbook', {
                    referenceType: 'external-document',
                    number: 'HB-1',
                    title: 'Handbook',
                    target: 'd1',
                    baseline: baseline('d1'),
                  }),
                ],
              },
            ],
          },
        ],
      },
      documentSchema,
    ).doc;
    const state = EditorState.create({
      doc,
      plugins: [
        createContents({
          template: () => BASE_TEMPLATE,
          labels: { references: { groups: { 'catalogue-entry': 'Catalogue' } } },
          ...(options.href
            ? { citationHref: ({ baseline: cited }) => `/documents/${cited.documentId}` }
            : {}),
        }),
      ],
    });
    return new EditorView(document.body.appendChild(document.createElement('div')), { state });
  }

  const rows = (view: EditorView) =>
    [...view.dom.querySelectorAll<HTMLElement>('.de-contents__entry')].map((row) =>
      [row.tagName, row.textContent, row.getAttribute('href') ?? ''].join('|'),
    );

  it('DOCE-CONTENTS-2.11 lists each group under its heading, a cited document as a link', () => {
    const view = referencesView({ href: true });
    expect(rows(view)).toEqual([
      'DIV|Documents|',
      'A|HB-1 - Handbook|/documents/d1',
      'DIV|Catalogue|',
      'DIV|C-1 - Catalogued|',
    ]);
    const link = view.dom.querySelector('a.de-contents__entry');
    expect(link).toHaveAttribute('target', '_blank');
    // The link is what the keys reach; a heading and a citation the host links nowhere are text.
    expect(view.dom.querySelectorAll('[data-choosable]')).toHaveLength(1);
    expect(link).toHaveAttribute('tabindex', '0');
    expect(view.dom.querySelector('.de-contents__group')).not.toHaveAttribute('role');
    view.destroy();
  });

  it('DOCE-CONTENTS-2.11 shows only the groups its filter names, and plain text without links', () => {
    const view = referencesView({ filter: 'catalogue-entry' });
    expect(rows(view)).toEqual(['DIV|Catalogue|', 'DIV|C-1 - Catalogued|']);
    let list = 0;
    view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'toc_block') list = pos;
    });
    expect(contentsGroupsAt(view.state, list)).toEqual([
      { group: 'external-document', title: 'Documents', shown: false },
      { group: 'catalogue-entry', title: 'Catalogue', shown: true },
    ]);
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, list)));
    setContentsGroups(
      ['catalogue-entry', 'external-document'],
      ['external-document', 'catalogue-entry'],
    )(view.state, view.dispatch);
    expect(view.state.doc.nodeAt(list)?.attrs.refFilter).toBeNull();
    expect(rows(view)).toHaveLength(4);
    view.destroy();
  });
});

describe('labels a host gives', () => {
  it('DOCE-CONTENTS-2.5 replaces a default list title and its empty text', () => {
    const doc = readDocumentFile(
      {
        formatVersion: 1,
        sections: [{ name: null, content: [{ type: 'contents', attrs: { kind: 'references' } }] }],
      },
      documentSchema,
    ).doc;
    const state = EditorState.create({
      doc,
      plugins: [
        createContents({
          template: () => BASE_TEMPLATE,
          labels: {
            references: { title: 'Cited documents', empty: 'Nothing is cited.' },
          },
        }),
      ],
    });
    const view = new EditorView(document.createElement('div'), { state });
    expect(view.dom.querySelector('.de-contents__title')).toHaveTextContent('Cited documents');
    expect(view.dom.querySelector('.de-contents__empty')).toHaveTextContent('Nothing is cited.');
    view.destroy();
  });
});
