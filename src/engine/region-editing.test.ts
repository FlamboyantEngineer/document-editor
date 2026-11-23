import { EditorState, TextSelection } from 'prosemirror-state';
import { addColumnAfter } from 'prosemirror-tables';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import {
  readDocumentFile,
  setPageRegions,
  type StoredContent,
  type TemplateFile,
} from '../model/index.js';
import { createDocumentSections, documentSectionsKey } from './document-sections.js';
import {
  createRegionEditing,
  type RegionChange,
  regionEdits,
  regionKey,
} from './region-editing.js';

const text = (value: string): StoredContent => [
  { type: 'paragraph', content: [{ type: 'text', text: value }] },
];

// A document of two pages, as the pagination splits one.
function twoPages() {
  const doc = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content: text('Body') }] },
    documentSchema,
  ).doc;
  const section = doc.firstChild?.copy(doc.firstChild.content.append(doc.firstChild.content));
  return section ? doc.copy(doc.content.replaceChild(0, section)) : doc;
}

describe('editing regions in place', () => {
  it('DOCE-SECTIONS-5.1 makes the regions editable, and shows an edit on every page', () => {
    let template: TemplateFile = { formatVersion: 1, id: 't', header: { content: text('Old') } };
    const changes: RegionChange[] = [];
    const plugins = [
      createRegionEditing({
        enabled: () => true,
        template: () => template,
        onChange: (change) => changes.push(change),
      }),
      createDocumentSections({ template: () => template }),
    ];
    let state = EditorState.create({ doc: twoPages(), plugins });
    state = state.apply(setPageRegions(state.tr, template, { editable: true }));
    const view = new EditorView(document.createElement('div'), { state });
    const headers = () => {
      const found: string[] = [];
      view.state.doc.descendants((node) => {
        if (node.type.name === 'page_header') found.push(node.textContent);
        return node.type.name !== 'page_header';
      });
      return found;
    };
    expect(headers()).toEqual(['Old', 'Old']);
    // Typing in the first page's header.
    let at = -1;
    view.state.doc.descendants((node, pos) => {
      if (at < 0 && node.type.name === 'page_header') at = pos + 1 + 1 + 3;
      return at < 0;
    });
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
    view.dispatch(view.state.tr.insertText(' and new'));
    expect(headers()).toEqual(['Old and new', 'Old and new']);
    expect(changes.at(-1)).toEqual({
      section: null,
      region: 'header',
      content: text('Old and new'),
    });
    // Once the template holds the edit, the template stands again.
    template = { ...template, header: { content: text('Old and new') } };
    view.dispatch(view.state.tr.setMeta(documentSectionsKey, true));
    expect(regionEdits(view.state).has(regionKey(null, 'header'))).toBe(false);
    view.destroy();
  });

  it('DOCE-SECTIONS-5.1 shows an edit of the document header in every section that shows it, at once', () => {
    const template: TemplateFile = {
      formatVersion: 1,
      id: 't',
      header: { content: text('Old') },
      sections: [{ name: 'annex', header: { content: text('Annex') } }],
    };
    const plugins = [
      createRegionEditing({ enabled: () => true, template: () => template, onChange: () => {} }),
      createDocumentSections({ template: () => template }),
    ];
    const doc = readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          { name: null, content: text('Body') },
          { name: 'notes', content: text('Notes') },
          { name: 'annex', content: text('Annex body') },
        ],
      },
      documentSchema,
    ).doc;
    let state = EditorState.create({ doc, plugins });
    state = state.apply(setPageRegions(state.tr, template, { editable: true }));
    const headers = () => {
      const found: string[] = [];
      state.doc.descendants((node) => {
        if (node.type.name === 'page_header') found.push(node.textContent);
        return node.type.name !== 'page_header';
      });
      return found;
    };
    expect(headers()).toEqual(['Old', 'Old', 'Annex']);
    let at = -1;
    state.doc.descendants((node, pos) => {
      if (at < 0 && node.type.name === 'page_header') at = pos + 1 + 1 + 3;
      return at < 0;
    });
    // Before the template holds the edit, the section that inherits the header shows it too, in the
    // same transaction, as the host's state will once its template changes.
    state = state.apply(state.tr.insertText(' and new', at));
    expect(headers()).toEqual(['Old and new', 'Old and new', 'Annex']);
  });

  it('DOCE-SECTIONS-5.3 hands on a mark set in a header, which changes no positions', () => {
    const template: TemplateFile = { formatVersion: 1, id: 't', header: { content: text('Old') } };
    const changes: RegionChange[] = [];
    const plugins = [
      createRegionEditing({
        enabled: () => true,
        template: () => template,
        onChange: (change) => changes.push(change),
      }),
      createDocumentSections({ template: () => template }),
    ];
    let state = EditorState.create({ doc: twoPages(), plugins });
    state = state.apply(setPageRegions(state.tr, template, { editable: true }));
    const view = new EditorView(document.createElement('div'), { state });
    let at = -1;
    view.state.doc.descendants((node, pos) => {
      if (at < 0 && node.type.name === 'page_header') at = pos + 2;
      return at < 0;
    });
    const bold = documentSchema.marks.strong;
    if (!bold) throw new Error('The schema has no strong mark.');
    view.dispatch(view.state.tr.addMark(at, at + 3, bold.create()));
    expect(changes.at(-1)).toEqual({
      section: null,
      region: 'header',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Old', marks: [{ type: 'bold' }] }] },
      ],
    });
    view.destroy();
  });

  it('DOCE-SECTIONS-5.4 edits a table in a header on every page, the root marked while editing', () => {
    const cell = (value: string) => ({ type: 'tableCell', content: text(value) });
    const table: StoredContent = [
      {
        type: 'table',
        attrs: { border: 'table-border-none' },
        content: [{ type: 'tableRow', content: [cell('Left'), cell('Right')] }],
      },
    ];
    const template: TemplateFile = { formatVersion: 1, id: 't', header: { content: table } };
    const changes: RegionChange[] = [];
    let enabled = true;
    const plugins = [
      createRegionEditing({
        enabled: () => enabled,
        template: () => template,
        onChange: (change) => changes.push(change),
      }),
      createDocumentSections({ template: () => template }),
    ];
    let state = EditorState.create({ doc: twoPages(), plugins });
    state = state.apply(setPageRegions(state.tr, template, { editable: true }));
    const view = new EditorView(document.createElement('div'), { state });
    expect(view.dom).toHaveAttribute('data-template-editing', 'true');
    // The caret in the first page's header, in its first cell's text.
    let at = -1;
    view.state.doc.descendants((node, pos) => {
      if (at < 0 && node.isText && node.text === 'Left') at = pos + 4;
      return at < 0;
    });
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
    view.dispatch(view.state.tr.insertText(' side'));
    addColumnAfter(view.state, view.dispatch);
    const columns: number[] = [];
    view.state.doc.descendants((node) => {
      if (node.type.name === 'table_row') columns.push(node.childCount);
      return true;
    });
    // Both pages' headers hold the table with the new column, and the template hears it.
    expect(columns).toEqual([3, 3]);
    const [written] = changes.at(-1)?.content ?? [];
    expect(written?.attrs).toMatchObject({ border: 'table-border-none' });
    expect(JSON.stringify(written)).toContain('Left side');
    enabled = false;
    view.updateState(view.state);
    expect(view.dom).not.toHaveAttribute('data-template-editing');
    view.destroy();
  });

  it('DOCE-SECTIONS-5.1 sets a read-only region back to its template after a change in it', () => {
    const template: TemplateFile = { formatVersion: 1, id: 't', footer: { content: text('Page') } };
    const changes: RegionChange[] = [];
    const plugins = [
      createRegionEditing({
        enabled: () => false,
        template: () => template,
        onChange: (change) => changes.push(change),
      }),
      createDocumentSections({ template: () => template }),
    ];
    let state = EditorState.create({ doc: twoPages(), plugins });
    state = state.apply(setPageRegions(state.tr, template));
    let at = -1;
    state.doc.descendants((node, pos) => {
      if (at < 0 && node.isText && node.text === 'Page') at = pos + 4;
      return at < 0;
    });
    // A composition committed in the first page's footer, which the DOM let through.
    state = state.apply(state.tr.insertText(' typed', at));
    const footers: string[] = [];
    state.doc.descendants((node) => {
      if (node.type.name === 'page_footer') footers.push(node.textContent);
      return node.type.name !== 'page_footer';
    });
    expect(footers).toEqual(['Page', 'Page']);
    expect(regionEdits(state).size).toBe(0);
    expect(changes).toEqual([]);
  });
});
