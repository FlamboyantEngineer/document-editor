import { EditorState, TextSelection } from 'prosemirror-state';
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
  );
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
});
