import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { Transform } from 'prosemirror-transform';
import { EditorView } from 'prosemirror-view';
import { beforeEach, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../../test/canvas-fixtures.js';
import { documentSchema } from '../../test/document-markup.js';
import { reservedPage } from '../layout-engine/blocks/contents.js';
import {
  BASE_TEMPLATE,
  readDocumentFile,
  setPageRegions,
  type StoredNode,
} from '../model/index.js';
import { layoutDocument } from './layout-document.js';
import { createPagesTextEngine } from './text-engine.js';
import type { PagesTextEngine } from './text-engine-types.js';

const text = (value: string): StoredNode => ({ type: 'text', text: value });
const heading = (value: string): StoredNode => ({
  type: 'heading',
  attrs: { level: 1 },
  content: [text(value)],
});

// A list of contents, then a heading on a page of its own for each of `count` headings.
function documentOf(count: number): ProseMirrorNode {
  const content: StoredNode[] = [{ type: 'contents', attrs: { id: 'list' } }];
  for (let index = 0; index < count; index += 1) {
    content.push(heading(`Part ${String(index + 1)}`), { type: 'pageBreak' });
  }
  const { doc } = readDocumentFile({ formatVersion: 1, sections: [{ content }] }, documentSchema);
  return setPageRegions(new Transform(doc), BASE_TEMPLATE).doc;
}

// The first node of a type in a document, and where it is.
function find(doc: ProseMirrorNode, type: string) {
  let found: { node: ProseMirrorNode; pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (node.type.name === type) found = { node, pos };
    return !found;
  });
  return found as { node: ProseMirrorNode; pos: number } | null;
}

function engineOf(): PagesTextEngine {
  return createPagesTextEngine({
    template: BASE_TEMPLATE,
    measureIn: document.createElement('div'),
    onAtomsSettled: () => undefined,
  });
}

// The pages a view of a document is laid out on, by the blocks each holds, and the digits the
// list's page boxes kept room for.
function pagesOf(view: EditorView, engine: PagesTextEngine, reasons: string[] = []) {
  const pages = layoutDocument(view, {
    pageHeight: 2000,
    engine,
    onUnsettled: (reason) => reasons.push(reason),
  });
  const shape = pages.map((section) =>
    section.map((page) =>
      page.map((node) => `${node.type.name}:${String(node.attrs.entryStart ?? '')}`),
    ),
  );
  return { shape, count: pages.flat().length, digits: engine.pageDigits(pages.flat().length) };
}

beforeEach(() => {
  installFakeCanvas();
});

describe('the page boxes of a list of contents', () => {
  it('DOCE-PAGINATION-10.11 keeps room for three digits, whatever the pages read', () => {
    const engine = engineOf();
    const doc = documentOf(3);
    engine.number(doc);
    const contents = find(doc, 'toc_block')?.node;
    if (!contents) throw new Error('no list');
    const block = engine.measureBlock(contents, null);
    expect(block?.measurement).toMatchObject({ rows: [{}, {}, {}] });
    const drawn = engine.contentsDrawn(contents, null);
    expect(reservedPage(3)).toBe('000');
    expect(drawn?.rows).toEqual([[0], [0], [0]]);
    // The title is drawn on the engine's lines too.
    expect(drawn?.title).toEqual([0]);
    const three = drawn?.pageWidths[0] ?? 0;
    expect(three).toBeGreaterThan(0);
    engine.pageDigits(1000);
    expect(engine.contentsDrawn(contents, null)?.pageWidths[0]).toBeCloseTo((three * 4) / 3, 1);
    engine.destroy();
  });

  it('DOCE-PAGINATION-10.11 settles past page 999 the same from a fresh load and after edits', () => {
    const doc = documentOf(995);
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({ doc }),
    });
    const engine = engineOf();
    const reasons: string[] = [];
    const first = pagesOf(view, engine, reasons);
    expect(first.count).toBeGreaterThanOrEqual(1000);
    // No page number is wider than the box its row kept room for.
    expect(String(first.count).length).toBeLessThanOrEqual(first.digits);
    expect(first.digits).toBe(4);
    expect(reasons).toEqual([]);
    // Laid out again, and after an edit taken back, the pages are the same.
    expect(pagesOf(view, engine).shape).toEqual(first.shape);
    const part = find(view.state.doc, 'heading');
    if (!part) throw new Error('no heading');
    const edit = view.state.tr.insertText(' and more words', part.pos + 1);
    view.updateState(view.state.apply(edit));
    pagesOf(view, engine);
    view.updateState(EditorState.create({ doc }));
    expect(pagesOf(view, engine).shape).toEqual(first.shape);
    const fresh = engineOf();
    expect(pagesOf(view, fresh).shape).toEqual(first.shape);
    fresh.destroy();
    engine.destroy();
    view.destroy();
  });
});
