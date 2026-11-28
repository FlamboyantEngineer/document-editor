// The template variables of the pages' body text under the text layout engine (DOCE-PAGINATION-11.13).

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { Transform } from 'prosemirror-transform';
import { EditorView } from 'prosemirror-view';
import { beforeEach, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../../test/canvas-fixtures.js';
import { documentSchema } from '../../test/document-markup.js';
import {
  BASE_TEMPLATE,
  readDocumentFile,
  setPageRegions,
  type StoredNode,
} from '../model/index.js';
import { hasBodyPageVariable } from './body-variables.js';
import { layoutDocument } from './layout-document.js';
import { createPagesTextEngine } from './text-engine.js';

const text = (value: string): StoredNode => ({ type: 'text', text: value });
const variable = (key: string): StoredNode => ({ type: 'variable', attrs: { key } });

// A document of a paragraph with a title and the page count, then `breaks` empty pages.
function documentOf(breaks = 0, footer = false): ProseMirrorNode {
  const line = [text('Title: '), variable('document.title'), text(' of '), variable('page.total')];
  const content: StoredNode[] = [{ type: 'paragraph', content: footer ? [text('Body')] : line }];
  for (let index = 0; index < breaks; index += 1) content.push({ type: 'pageBreak' });
  const { doc } = readDocumentFile({ formatVersion: 1, sections: [{ content }] }, documentSchema);
  return setPageRegions(new Transform(doc), BASE_TEMPLATE).doc;
}

// The document's first body paragraph.
function paragraphOf(doc: ProseMirrorNode): ProseMirrorNode {
  let found: ProseMirrorNode | null = null;
  doc.descendants((node) => {
    if (!found && node.type.name === 'paragraph') found = node;
    return !found;
  });
  if (!found) throw new Error('no paragraph');
  return found;
}

function engineOf() {
  return createPagesTextEngine({
    template: BASE_TEMPLATE,
  });
}

// A document storing a title's text (DOCE-FORMAT-1.7).
const titled = (doc: ProseMirrorNode, title: string) =>
  new Transform(doc).setDocAttribute('values', { 'document.title': title }).doc;

beforeEach(() => {
  installFakeCanvas();
});

describe('the template variables of the body text', () => {
  it('DOCE-PAGINATION-11.13 lays a body variable out as the text the document stores', () => {
    const engine = engineOf();
    const doc = documentOf();
    const paragraph = paragraphOf(doc);
    engine.number(titled(doc, 'Notes'));
    const short = engine.measureBlock(paragraph, null);
    expect(short).not.toBeNull();
    expect(engine.measureBlock(paragraph, null)).toBe(short);
    expect(engine.stats().refused).toBe(0);
    // Another stored text lays the same block out again, here on more lines.
    engine.number(titled(doc, 'a much longer title '.repeat(12).trim()));
    const long = engine.measureBlock(paragraph, null);
    expect(long).not.toBe(short);
    expect(long?.height).toBeGreaterThan(short?.height ?? 0);
    engine.destroy();
  });

  it('DOCE-PAGINATION-11.13 lays the page count out in a box of room for its digits, at least three', () => {
    const engine = engineOf();
    const paragraph = paragraphOf(documentOf());
    const width = () => engine.lines(paragraph, { scope: null })?.reserved?.[0]?.width ?? 0;
    const three = width();
    expect(three).toBeGreaterThan(0);
    expect(engine.lines(paragraph, { scope: null })?.reserved).toHaveLength(1);
    // A count of 1000 pages keeps room for four digits.
    engine.pageDigits(1000);
    expect(width()).toBeCloseTo((three * 4) / 3, 1);
    engine.destroy();
  });

  it('DOCE-PAGINATION-11.13 finds a page variable in the body text, not in a header or footer', () => {
    expect(hasBodyPageVariable(documentOf())).toBe(true);
    const doc = documentOf(0, true);
    expect(hasBodyPageVariable(doc)).toBe(false);
  });

  it('DOCE-PAGINATION-11.13 settles the page variables past page 999 as a list of contents does', () => {
    const doc = documentOf(1000);
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({ doc }),
    });
    const engine = engineOf();
    const reasons: string[] = [];
    const pages = layoutDocument(view, {
      pageHeight: 2000,
      engine,
      onUnsettled: (reason) => reasons.push(reason),
    });
    expect(pages.flat().length).toBeGreaterThanOrEqual(1000);
    expect(reasons).toEqual([]);
    // The layout kept room for four digits.
    const fresh = engineOf();
    fresh.pageDigits(1000);
    const paragraph = paragraphOf(view.state.doc);
    const box = (each: typeof engine) => each.lines(paragraph, { scope: null })?.reserved?.[0];
    expect(box(engine)).toEqual(box(fresh));
    fresh.destroy();
    engine.destroy();
    view.destroy();
  });
});
