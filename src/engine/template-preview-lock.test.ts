import type { Node } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import {
  readDocumentFile,
  setPageRegions,
  type StoredContent,
  type TemplateFile,
  templatePreviewDocument,
} from '../model/index.js';
import { templatePreviewLock } from './template-content-editing.js';
import { templatePreviewLockOf } from './template-preview-lock.js';

const text = (value: string): StoredContent => [
  { type: 'paragraph', content: [{ type: 'text', text: value }] },
];

const cell = (value: string) => ({ type: 'table_cell', content: text(value) });

const TEMPLATE: TemplateFile = {
  formatVersion: 1,
  id: 'preview',
  header: { content: text('Document header') },
  sections: [
    {
      name: 'cover',
      header: { content: text('Cover header') },
      content: [
        ...text('Cover text'),
        { type: 'table', content: [{ type: 'table_row', content: [cell('Cover cell')] }] },
      ],
    },
    { name: 'body', placeholder: text('Body placeholder') },
  ],
};

// The preview of a tab with its pages' regions, as the editor fills them from the template.
function preview(scope: string | null): Node {
  const file = templatePreviewDocument(TEMPLATE, undefined, { parts: true, scope });
  const state = EditorState.create({ doc: readDocumentFile(file, documentSchema).doc });
  return state.apply(setPageRegions(state.tr, TEMPLATE, { editable: true })).doc;
}

// The position inside each textblock whose text is the one given, in document order.
function inside(doc: Node, value: string): number[] {
  const found: number[] = [];
  doc.descendants((node, pos) => {
    if (node.isTextblock && node.textContent === value) found.push(pos + 1);
  });
  return found;
}

describe('the lock of a workspace preview tab', () => {
  it('DOCE-TEMPLATE-EDITOR-3.16 locks a section’s own header on the document’s tab only', () => {
    const all = preview(null);
    const lock = templatePreviewLockOf({ template: TEMPLATE, scope: null });
    const [cover] = inside(all, 'Cover header');
    expect(cover).toBeDefined();
    expect(lock(all, cover ?? 0)).toBe(true);
    // The document's own header, which the body section shows, stays editable.
    expect(inside(all, 'Document header').every((pos) => !lock(all, pos))).toBe(true);
    const alone = preview('cover');
    const own = templatePreviewLockOf({ template: TEMPLATE, scope: 'cover' });
    expect(inside(alone, 'Cover header').every((pos) => !own(alone, pos))).toBe(true);
  });

  it('DOCE-TEMPLATE-EDITOR-3.16 keeps a section’s tables and its own sample read-only', () => {
    const doc = preview('cover');
    const lock = templatePreviewLockOf({ template: TEMPLATE, scope: 'cover' });
    const [text] = inside(doc, 'Cover text');
    const [table] = inside(doc, 'Cover cell');
    expect(lock(doc, text ?? 0)).toBe(false);
    expect(lock(doc, table ?? 0)).toBe(true);
    // The sample after the section's parts, in a third section of its name, is read-only too.
    const [sample] = inside(doc, 'Heading 1');
    expect(sample).toBeDefined();
    expect(templatePreviewLock(doc, sample ?? 0)).toBe(true);
    expect(lock(doc, sample ?? 0)).toBe(true);
  });

  it('DOCE-TEMPLATE-EDITOR-3.16 locks a header that takes its parent’s, the document’s or the parent template’s', () => {
    const all = preview('body');
    const [body] = inside(all, 'Document header');
    expect(body).toBeDefined();
    // The body section takes the document's header, which the document writes.
    expect(templatePreviewLockOf({ template: TEMPLATE, scope: 'body' })(all, body ?? 0)).toBe(
      false,
    );
    // The document's header set to take the parent template's.
    const own: TemplateFile = { ...TEMPLATE, header: { inherit: true } };
    expect(templatePreviewLockOf({ template: TEMPLATE, scope: 'body', own })(all, body ?? 0)).toBe(
      true,
    );
    // The section set to take the document's.
    const inheriting: TemplateFile = {
      ...TEMPLATE,
      sections: [
        ...(TEMPLATE.sections ?? []).filter((section) => section.name !== 'body'),
        { name: 'body', header: { inherit: true } },
      ],
    };
    expect(templatePreviewLockOf({ template: inheriting, scope: 'body' })(all, body ?? 0)).toBe(
      true,
    );
  });
});
