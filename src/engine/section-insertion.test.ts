import type { Node } from 'prosemirror-model';
import { type Command, EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import {
  readDocumentFile,
  type StoredNode,
  type TemplateFile,
  writeDocumentFile,
} from '../model/index.js';
import {
  insertTemplateSection,
  removeEmptyTemplateSections,
  templateSectionInsertPoints,
} from './section-insertion.js';

const paragraph = (value?: string): StoredNode =>
  value ? { type: 'paragraph', content: [{ type: 'text', text: value }] } : { type: 'paragraph' };

const TEMPLATE: TemplateFile = {
  formatVersion: 1,
  id: 'report',
  sections: [
    { name: 'cover', required: true, insertable: false },
    { name: 'summary', insertable: true, content: [paragraph('Summary text')] },
    { name: 'body', required: true },
    { name: 'appendix', insertable: true },
    { name: 'glossary', insertable: true, required: true },
  ],
};

const read = (...sections: { name: string | null; content: StoredNode[] }[]) =>
  readDocumentFile({ formatVersion: 1, sections }, documentSchema).doc;

// Each section as its name and its blocks' text.
const outline = (doc: Node) =>
  writeDocumentFile(doc).sections.map(
    (section) =>
      `${section.name ?? '-'}:${section.content
        .map((block) => (block.content ?? []).map((child) => child.text ?? '').join(''))
        .join(',')}`,
  );

// A state over the document, the caret in its first text.
function stateOf(doc: Node): EditorState {
  const state = EditorState.create({ doc });
  return state.apply(state.tr.setSelection(TextSelection.atStart(doc)));
}

function run(state: EditorState, command: Command): EditorState | null {
  let next: EditorState | null = null;
  const ran = command(state, (tr) => {
    next = state.apply(tr);
  });
  return ran ? next : null;
}

const DOC = () =>
  read(
    { name: 'cover', content: [paragraph('Cover')] },
    { name: 'body', content: [paragraph('Body')] },
    { name: null, content: [paragraph('Notes')] },
  );

describe('template-ordered sections', () => {
  it('DOCE-SECTIONS-2.5 adds a section where the template places it, whatever the caret', () => {
    const state = stateOf(DOC());
    const summary = run(state, insertTemplateSection(TEMPLATE, 'summary'));
    expect(summary && outline(summary.doc)).toEqual([
      'cover:Cover',
      'summary:Summary text',
      'body:Body',
      '-:Notes',
    ]);
    expect(summary?.selection.$from.parent.textContent).toBe('Summary text');
    // After the writer's own sections, which follow the body.
    const appendix = summary && run(summary, insertTemplateSection(TEMPLATE, 'appendix'));
    expect(appendix && outline(appendix.doc)).toEqual([
      'cover:Cover',
      'summary:Summary text',
      'body:Body',
      '-:Notes',
      'appendix:',
    ]);
  });

  it('DOCE-SECTIONS-2.5 refuses a section the document has, a required one and an unknown one', () => {
    const state = stateOf(DOC());
    const once = run(state, insertTemplateSection(TEMPLATE, 'summary'));
    expect(once && run(once, insertTemplateSection(TEMPLATE, 'summary'))).toBeNull();
    expect(run(state, insertTemplateSection(TEMPLATE, 'cover'))).toBeNull();
    expect(run(state, insertTemplateSection(TEMPLATE, 'glossary'))).toBeNull();
    expect(run(state, insertTemplateSection(TEMPLATE, 'missing'))).toBeNull();
  });

  it('DOCE-SECTIONS-2.5 takes out the insertable sections left empty, keeping one section', () => {
    const doc = read(
      { name: 'cover', content: [paragraph()] },
      { name: 'summary', content: [paragraph()] },
      { name: 'body', content: [paragraph('Body')] },
      { name: 'appendix', content: [paragraph('Kept')] },
    );
    const state = stateOf(doc);
    const cleaned = run(state, removeEmptyTemplateSections(TEMPLATE));
    expect(cleaned && outline(cleaned.doc)).toEqual(['cover:', 'body:Body', 'appendix:Kept']);
    expect(cleaned && run(cleaned, removeEmptyTemplateSections(TEMPLATE))).toBeNull();
    const only = stateOf(read({ name: 'summary', content: [paragraph()] }));
    expect(run(only, removeEmptyTemplateSections(TEMPLATE))).toBeNull();
  });

  it('DOCE-SECTIONS-2.6 lists the insert points of the insertable sections a document lacks', () => {
    const doc = DOC();
    const points = templateSectionInsertPoints(doc, TEMPLATE);
    expect(points.map((point) => point.name)).toEqual(['summary', 'appendix']);
    const cover = doc.child(0).nodeSize;
    expect(points[0]?.pos).toBe(cover);
    expect(points[1]?.pos).toBe(doc.content.size);
    const state = stateOf(doc);
    const added = run(state, insertTemplateSection(TEMPLATE, 'summary'));
    expect(added && templateSectionInsertPoints(added.doc, TEMPLATE).map((p) => p.name)).toEqual([
      'appendix',
    ]);
  });
});
