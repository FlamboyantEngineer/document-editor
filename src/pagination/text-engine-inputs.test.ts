import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeCanvas } from '../../test/canvas-fixtures.js';
import { documentSchema } from '../../test/document-markup.js';
import { note, paragraph, text } from '../../test/footnote-fixtures.js';
import { readRegressionDocument, readRegressionTemplate } from '../../test/stored-fixtures.js';
import type { LineTable } from '../layout-engine/line-table.js';
import {
  isTextMeasurement,
  type LayoutBlock,
  readDocumentFile,
  type StoredNode,
} from '../model/index.js';
import { BASE_TEMPLATE } from '../model/templates/base-template.js';
import { createPagesTextEngine } from './text-engine.js';

beforeEach(() => {
  installFakeCanvas();
});

const read = (content: StoredNode[]) =>
  readDocumentFile({ formatVersion: 1, sections: [{ name: null, content }] }, documentSchema).doc;

// The top-level blocks of a document's page content.
function blocksOf(doc: ProseMirrorNode): ProseMirrorNode[] {
  const blocks: ProseMirrorNode[] = [];
  doc.descendants((node) => {
    if (node.type.name !== 'page_content') return true;
    node.forEach((block) => blocks.push(block));
    return false;
  });
  return blocks;
}

// The pages' engine; footnote markers laid out too, as once thread Q3's superscript fix lands.
function engineOf(view?: EditorView) {
  return createPagesTextEngine({
    template: BASE_TEMPLATE,
    measureIn: view?.dom.parentElement ?? document.createElement('div'),
    onAtomsSettled: () => undefined,
    refusedTextAtoms: new Map(),
    ...(view ? { view: () => view } : {}),
  });
}

// The line table a block was laid out with, which the engine keeps in its measurement.
function tableOf(block: LayoutBlock | null | undefined): LineTable | undefined {
  const measurement = block?.measurement;
  return isTextMeasurement(measurement) ? (measurement.lines as LineTable | undefined) : undefined;
}

const notes = (count: number) =>
  Array.from({ length: count }, (_, index) => paragraph(note(`n${String(index)}`, 'note')));

describe('the pages engine and its inputs', () => {
  it('DOCE-PAGINATION-11.1 lays a block with footnote markers out with their numbers, again when they change', () => {
    const cited = paragraph(text('aaaa '), note('last', 'its note'));
    const first = read([cited]);
    const engine = engineOf();
    engine.number(first);
    const block = blocksOf(first)[0];
    if (!block) throw new Error('no block');
    const width = (node: ProseMirrorNode) =>
      tableOf(engine.measureBlock(node, null))?.lines[0]?.width;
    const laid = engine.measureBlock(block, null);
    expect(laid).not.toBeNull();
    expect(engine.stats().refused).toBe(0);
    expect(engine.measureBlock(block, null)).toBe(laid);
    // `aaaa ` and `1` drawn at `font-size: smaller`, 10px: 5px a digit.
    expect(width(block)).toBe(27 + 5);
    // Nine notes before it make its marker `10`: laid out again, wider.
    const later = read([...notes(9), cited]);
    const moved = blocksOf(later).at(-1);
    if (!moved) throw new Error('no block');
    engine.number(later);
    expect(width(moved)).toBe(27 + 10);
    engine.destroy();
  });

  it('DOCE-PAGINATION-11.1 gives the lines the block was laid out on, its number and markers included', () => {
    const doc = read([paragraph(text('aaaa bbbb cccc dddd eeee ffff'), note('a', 'one'))]);
    const engine = engineOf();
    engine.number(doc);
    const block = blocksOf(doc)[0];
    if (!block) throw new Error('no block');
    const laid = tableOf(engine.measureBlock(block, null))?.lines;
    expect(laid?.length).toBeGreaterThan(0);
    expect(engine.lines(block, { scope: null })?.lines).toEqual(laid);
    const number = { label: '1.2', level: 2, levelStyle: { styleConfig: null } };
    const numbered = engine.lines(block, { scope: null, number });
    expect(numbered?.lines[0]?.width).not.toBe(laid?.[0]?.width);
    expect(engine.lines(block, { scope: null, number })).toBe(numbered);
    engine.destroy();
  });

  it('DOCE-PAGINATION-10.8 measures an inline atom as the pages measuring view draws it', () => {
    const doc = read([
      paragraph(text('aa '), { type: 'math_inline', content: [text('x^2')] }, text(' bb')),
    ]);
    const element = document.createElement('div');
    document.body.append(element);
    const view = new EditorView(element, {
      state: EditorState.create({ doc }),
      editable: () => false,
    });
    const engine = engineOf(view);
    engine.number(doc);
    const block = blocksOf(doc)[0];
    if (!block) throw new Error('no block');
    expect(engine.measureBlock(block, null)).not.toBeNull();
    expect(engine.stats()).toMatchObject({ laid: 1, refused: 0 });
    // Measured in copies, removed after.
    expect(element.querySelector('.de-atom-measure')?.childElementCount).toBe(0);
    engine.destroy();
    view.destroy();
    element.remove();
  });

  it('DOCE-PAGINATION-11.1 leaves only captions, footnote markers and contents lists of the stored documents to the DOM', () => {
    const documents = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../test/fixtures/documents',
    );
    const names = readdirSync(documents).filter((name) => name.endsWith('.json'));
    const reasons = new Set<string>();
    let laid = 0;
    for (const name of names) {
      const file = readRegressionDocument(name.slice(0, -'.json'.length));
      const template = readRegressionTemplate(file.template?.id ?? 'regression-base');
      const { doc } = readDocumentFile(file, documentSchema);
      const engine = createPagesTextEngine({
        template,
        measureIn: document.createElement('div'),
        onAtomsSettled: () => undefined,
      });
      engine.number(doc);
      doc.forEach((section) => {
        const scope =
          typeof section.attrs.sectionName === 'string' ? section.attrs.sectionName : null;
        for (const block of blocksOf(section)) engine.measureBlock(block, scope);
      });
      laid += engine.stats().laid;
      for (const reason of engine.stats().reasons.keys()) reasons.add(reason);
      engine.destroy();
    }
    expect(laid).toBeGreaterThanOrEqual(676);
    // Captions are laid out as text by thread G's next change, footnote markers once thread Q3's
    // superscript fix lands; contents lists are the DOM's still.
    const left = [...reasons].filter(
      (reason) =>
        !/^not a text block: (table|figure|code)_caption$/.test(reason) &&
        reason !== 'toc_block is not laid out by the engine yet' &&
        reason !== 'footnote marker raises its line',
    );
    expect(left).toEqual([]);
  });

  it('DOCE-PAGINATION-11.1 tells that an atom it measured still loads until it settles', async () => {
    const settled = vi.fn();
    const measureIn = document.createElement('div');
    document.body.append(measureIn);
    const engine = createPagesTextEngine({
      template: BASE_TEMPLATE,
      measureIn,
      onAtomsSettled: settled,
    });
    const image = { type: 'image', attrs: { src: 'https://example.org/a.png' } };
    const doc = read([paragraph(text('aaaa '), image as StoredNode)]);
    engine.number(doc);
    const [block] = blocksOf(doc);
    if (!block) throw new Error('no paragraph');
    expect(engine.measureBlock(block, null)).not.toBeNull();
    expect(engine.provisional()).toBe(true);
    measureIn.querySelector('img')?.dispatchEvent(new Event('load'));
    await vi.waitFor(() => expect(settled).toHaveBeenCalled());
    expect(engine.provisional()).toBe(false);
    engine.destroy();
    measureIn.remove();
  });
});
