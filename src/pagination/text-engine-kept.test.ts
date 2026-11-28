import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { Transform } from 'prosemirror-transform';
import { beforeEach, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../../test/canvas-fixtures.js';
import { documentSchema } from '../../test/document-markup.js';
import {
  BASE_TEMPLATE,
  readDocumentFile,
  setPageRegions,
  type StoredNode,
} from '../model/index.js';
import { createLayoutMemory, layoutDocument } from './layout-document.js';
import { createPagesTextEngine } from './text-engine.js';
import type { PagesTextEngine } from './text-engine-types.js';

const text = (value: string): StoredNode => ({ type: 'text', text: value });
const paragraph = (value: string): StoredNode => ({ type: 'paragraph', content: [text(value)] });
const heading = (value: string): StoredNode => ({
  type: 'heading',
  attrs: { level: 1 },
  content: [text(value)],
});

beforeEach(() => {
  installFakeCanvas();
});

// A state of sections, each a heading and paragraphs, with the template's page regions.
function sectionsState(sections: StoredNode[][]): EditorState {
  const { doc } = readDocumentFile(
    { formatVersion: 1, sections: sections.map((content) => ({ content })) },
    documentSchema,
  );
  return EditorState.create({ doc: setPageRegions(new Transform(doc), BASE_TEMPLATE).doc });
}

const section = (name: string, paragraphs: number): StoredNode[] => [
  heading(name),
  ...Array.from({ length: paragraphs }, (_, index) =>
    paragraph(`${name} paragraph ${String(index)} with a few words in it`),
  ),
];

// Each section's page content node, in order.
function contentsOf(doc: ProseMirrorNode): ProseMirrorNode[] {
  const found: ProseMirrorNode[] = [];
  doc.descendants((node) => {
    if (node.type.name === 'page_content') found.push(node);
    return node.type.name !== 'page_content';
  });
  return found;
}

// The start of the first paragraph in a section.
function paragraphIn(doc: ProseMirrorNode, index: number): number {
  let seen = -1;
  let found = -1;
  doc.descendants((node, pos) => {
    if (node.type.name === 'page_content') seen += 1;
    if (found < 0 && seen === index && node.type.name === 'paragraph') found = pos + 1;
    return found < 0;
  });
  return found;
}

// An engine whose section contents are recorded with the blocks each gave.
function recordingEngine() {
  const engine = createPagesTextEngine({ template: BASE_TEMPLATE });
  const given = new Map<ProseMirrorNode, readonly unknown[]>();
  const measureContent = engine.measureContent.bind(engine);
  const recorded: PagesTextEngine = Object.assign(engine, {
    measureContent: (...args: Parameters<PagesTextEngine['measureContent']>) => {
      const blocks = measureContent(...args);
      given.set(args[0], blocks);
      return blocks;
    },
  });
  return { engine: recorded, given };
}

const heights = (pages: ReturnType<typeof layoutDocument>) =>
  pages.map((sectionPages) => sectionPages.map((page) => page.length));

describe('the blocks of a section kept by its content', () => {
  it('DOCE-PAGINATION-11.15 walks only the typed section’s blocks again for a letter typed', () => {
    let state = sectionsState([section('One', 40), section('Two', 40), section('Three', 40)]);
    const { engine, given } = recordingEngine();
    const memory = createLayoutMemory();
    layoutDocument(state, { pageHeight: 900, engine, memory });
    const before = contentsOf(state.doc).map((content) => given.get(content));
    state = state.apply(state.tr.insertText('x', paragraphIn(state.doc, 1) + 2));
    layoutDocument(state, { pageHeight: 900, engine, memory });
    const after = contentsOf(state.doc).map((content) => given.get(content));
    expect(after[0]).toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
    expect(after[2]).toBe(before[2]);
    engine.destroy();
  });

  it('DOCE-PAGINATION-11.15 lays the other sections out with their new numbers after a structural edit', () => {
    let state = sectionsState([section('One', 5), section('Two', 5)]);
    const { engine, given } = recordingEngine();
    const memory = createLayoutMemory();
    layoutDocument(state, { pageHeight: 900, engine, memory });
    const [, second] = contentsOf(state.doc);
    const kept = second ? given.get(second) : undefined;
    expect(kept).toBeDefined();
    // A heading added in the first section renumbers the second's.
    const at = paragraphIn(state.doc, 0) - 1;
    state = state.apply(
      state.tr.insert(at, documentSchema.node('heading', { level: 1 }, documentSchema.text('New'))),
    );
    const pages = layoutDocument(state, { pageHeight: 900, engine, memory });
    const [, secondAfter] = contentsOf(state.doc);
    expect(secondAfter).toBe(second);
    expect(secondAfter ? given.get(secondAfter) : undefined).not.toBe(kept);
    const fresh = createPagesTextEngine({ template: BASE_TEMPLATE });
    expect(heights(pages)).toEqual(
      heights(layoutDocument(state, { pageHeight: 900, engine: fresh })),
    );
    fresh.destroy();
    engine.destroy();
  });

  it('DOCE-PAGINATION-11.15 keeps no section holding a list of contents, which reads the whole document', () => {
    let state = sectionsState([
      [{ type: 'contents', attrs: { kind: 'toc' } }, ...section('One', 3)],
      section('Two', 3),
    ]);
    const { engine, given } = recordingEngine();
    layoutDocument(state, { pageHeight: 900, engine });
    const [first] = contentsOf(state.doc);
    const listed = first ? given.get(first) : undefined;
    expect(listed).toBeDefined();
    // Text typed in the second section's heading changes the first section's list.
    let headingAt = -1;
    let headings = 0;
    state.doc.descendants((node, pos) => {
      if (node.type.name === 'heading' && (headings += 1) === 2) headingAt = pos + 1;
      return headingAt < 0;
    });
    state = state.apply(state.tr.insertText('Renamed ', headingAt));
    layoutDocument(state, { pageHeight: 900, engine });
    expect(contentsOf(state.doc)[0]).toBe(first);
    expect(first ? given.get(first) : undefined).not.toBe(listed);
    engine.destroy();
  });
});
