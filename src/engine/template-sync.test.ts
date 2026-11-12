import type { Node } from 'prosemirror-model';
import { type Command, EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import {
  BASE_TEMPLATE,
  readDocumentFile,
  type StoredNode,
  type TemplateFile,
  writeDocumentFile,
} from '../model/index.js';
import { createEditLock } from './edit-lock.js';
import {
  anyLock,
  lockedTemplateSections,
  syncTemplateSections,
  templateSectionDrift,
} from './template-sync.js';

const paragraph = (value: string): StoredNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text: value }],
});

const TEMPLATE: TemplateFile = {
  ...BASE_TEMPLATE,
  sections: [
    { name: 'cover', required: true, editable: false, content: [paragraph('Cover text')] },
    { name: 'appendix', insertable: true },
    { name: 'signatures', required: true, content: [paragraph('Sign here')] },
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

function run(state: EditorState, command: Command): EditorState {
  let next = state;
  expect(command(state, (tr) => (next = next.apply(tr)))).toBe(true);
  return next;
}

describe('template sections', () => {
  it('DOCE-SECTIONS-4.1 finds the sections that drifted from the template', () => {
    const doc = read(
      { name: 'cover', content: [paragraph('Edited cover')] },
      { name: null, content: [paragraph('Body')] },
      { name: 'annex', content: [paragraph('Old annex')] },
    );
    expect(templateSectionDrift(doc, TEMPLATE)).toEqual([
      { kind: 'missing', name: 'signatures' },
      { kind: 'stale', name: 'cover' },
      { kind: 'unexpected', name: 'annex' },
    ]);
    const kept = read(
      { name: 'cover', content: [paragraph('Cover text')] },
      { name: 'signatures', content: [paragraph('Signed')] },
    );
    expect(templateSectionDrift(kept, TEMPLATE)).toEqual([]);
  });

  it('DOCE-SECTIONS-4.2 brings the sections back in line with the template', () => {
    let state = EditorState.create({
      doc: read(
        { name: 'cover', content: [paragraph('Edited cover')] },
        { name: null, content: [paragraph('Body')] },
        { name: 'annex', content: [paragraph('Old annex')] },
      ),
    });
    state = run(state, syncTemplateSections(TEMPLATE));
    expect(outline(state.doc)).toEqual([
      'cover:Cover text',
      '-:Body',
      '-:Old annex',
      'signatures:Sign here',
    ]);
    expect(syncTemplateSections(TEMPLATE)(state)).toBe(false);
  });

  it('DOCE-SECTIONS-4.3 locks the sections the writer cannot edit', () => {
    const doc = read(
      { name: 'cover', content: [paragraph('Cover text')] },
      { name: null, content: [paragraph('Body')] },
    );
    const isLocked = anyLock(
      lockedTemplateSections(() => TEMPLATE),
      () => false,
    );
    const state = EditorState.create({ doc, plugins: [createEditLock({ isLocked })] });
    let cover = -1;
    let body = -1;
    doc.descendants((node, pos) => {
      if (node.isText && node.text === 'Cover text') cover = pos;
      if (node.isText && node.text === 'Body') body = pos;
    });
    expect(isLocked(doc, cover + 1)).toBe(true);
    expect(isLocked(doc, body + 1)).toBe(false);
    expect(state.apply(state.tr.insertText('x', cover + 1)).doc.eq(doc)).toBe(true);
    expect(state.apply(state.tr.insertText('x', body + 1)).doc.eq(doc)).toBe(false);
  });
});
