import type { Node } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import {
  readDocumentFile,
  type TemplateFile,
  type TemplatePartChange,
  templatePreviewDocument,
} from '../model/index.js';
import { createEditLock } from './edit-lock.js';
import {
  createTemplateContentEditing,
  editsTemplateContent,
  templatePreviewLock,
} from './template-content-editing.js';

const TEMPLATE: TemplateFile = {
  formatVersion: 1,
  id: 'preview',
  sections: [
    {
      name: 'summary',
      placeholder: [{ type: 'paragraph', content: [{ type: 'text', text: 'Summarise.' }] }],
    },
  ],
};

// The position just inside the first textblock whose text is the one given.
function inside(doc: Node, text: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found < 0 && node.isTextblock && node.textContent === text) found = pos + 1;
    return found < 0;
  });
  return found;
}

function preview(enabled = true) {
  const changes: TemplatePartChange[] = [];
  const doc = readDocumentFile(
    templatePreviewDocument(TEMPLATE, undefined, { parts: true }),
    documentSchema,
  ).doc;
  const state = EditorState.create({
    doc,
    plugins: [
      createTemplateContentEditing({
        enabled: () => enabled,
        onChange: (change) => changes.push(change),
      }),
      createEditLock({ isLocked: templatePreviewLock }),
    ],
  });
  const view = new EditorView(document.createElement('div'), { state });
  return { view, changes };
}

describe('editing template content in place', () => {
  it('DOCE-SECTIONS-5.2 hands on each edit of a section content or placeholder', () => {
    const { view, changes } = preview();
    expect(editsTemplateContent(view.state)).toBe(true);
    const parts = [...view.dom.querySelectorAll('[data-template-part]')].map((section) =>
      section.getAttribute('data-template-part'),
    );
    expect(parts).toEqual(['sample', 'content', 'placeholder']);
    const at = inside(view.state.doc, 'Summarise.') + 'Summarise.'.length;
    view.dispatch(view.state.tr.insertText(' Briefly.', at));
    expect(changes).toEqual([
      {
        section: 'summary',
        part: 'placeholder',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Summarise. Briefly.' }] }],
      },
    ]);
    view.destroy();
  });

  it('DOCE-SECTIONS-5.3 keeps the sample read-only and the sections as they are', () => {
    const { view, changes } = preview();
    const { doc } = view.state;
    const sample = inside(doc, 'Heading 1');
    expect(templatePreviewLock(doc, sample)).toBe(true);
    expect(templatePreviewLock(doc, inside(doc, 'Summarise.'))).toBe(false);
    view.dispatch(view.state.tr.insertText('x', sample));
    expect(view.state.doc).toBe(doc);
    // Joining the placeholder into the content section is refused.
    const start = inside(doc, 'Summarise.');
    const state = view.state.apply(view.state.tr.setSelection(TextSelection.create(doc, start)));
    let content = -1;
    doc.forEach((section, pos) => {
      if (section.attrs.sectionName === 'summary' && content < 0) content = pos + section.nodeSize;
    });
    view.updateState(state);
    view.dispatch(view.state.tr.delete(content - 4, start));
    expect(view.state.doc).toBe(doc);
    expect(changes).toEqual([]);
    view.destroy();
  });

  it('DOCE-SECTIONS-5.2 marks nothing and hears nothing while it is off', () => {
    const { view, changes } = preview(false);
    expect(view.dom.querySelector('[data-template-part]')).toBeNull();
    const at = inside(view.state.doc, 'Summarise.');
    view.dispatch(view.state.tr.insertText('x', at));
    expect(changes).toEqual([]);
    view.destroy();
  });
});
