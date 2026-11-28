import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { beforeEach, describe, expect, it } from 'vitest';
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
import { routeDomChange } from './projection-input.js';
import { createProjectionMap } from './projection-map.js';
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

function positionOf(doc: ProseMirrorNode, target: ProseMirrorNode): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (node === target) found = pos;
    return found < 0;
  });
  if (found < 0) throw new Error('No position');
  return found;
}

// The pages' engine; footnote markers laid out too, as once thread Q3's superscript fix lands.
function engineOf() {
  return createPagesTextEngine({ template: BASE_TEMPLATE, refusedTextAtoms: new Map() });
}

function engineOfEquations() {
  const glyph = { tag: 'mi', attrs: {}, children: ['x'] };
  return createPagesTextEngine({
    template: BASE_TEMPLATE,
    typesetOf: () => ({ state: 'ready', math: { tag: 'math', attrs: {}, children: [glyph] } }),
    mathLayouter: () => ({
      key: 'fixed-equation',
      prepare: () => null,
      layout: () => ({
        width: 900,
        ascent: 18,
        descent: 6,
        svg: { tag: 'svg', attrs: {}, children: [] },
        missing: '',
      }),
    }),
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

  it('DOCE-PAGINATION-11.1 DOCE-PAGINATION-12.10 lays out an unchanged table when its equation’s number grows', () => {
    const equation: StoredNode = { type: 'mathBlock', attrs: { source: 'x' } };
    const table: StoredNode = {
      type: 'table',
      content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [equation] }] }],
    };
    const doc = read([...Array.from({ length: 8 }, () => equation), table]);
    const first = blocksOf(doc)[0];
    const kept = blocksOf(doc).at(-1);
    const watched = kept?.lastChild?.lastChild?.lastChild?.lastChild;
    if (!first || !kept || watched?.type.name !== 'math_display') throw new Error('No equations');
    const later = EditorState.create({ doc }).tr.insert(
      positionOf(doc, first),
      first.type.create(first.attrs, first.content),
    ).doc;
    expect(blocksOf(later).at(-1)).toBe(kept);

    const engine = engineOfEquations();
    try {
      engine.number(doc);
      const before = engine.measureBlock(kept, null);
      const placed = engine.mathOf(watched);
      expect(placed?.end).toBeGreaterThan(0);
      expect(engine.measureBlock(kept, null)).toBe(before);
      engine.number(later);
      expect(engine.measureBlock(kept, null)).not.toBe(before);
      expect(engine.mathOf(watched)?.end).toBeGreaterThan(placed?.end ?? 0);
      expect(engine.mathOf(watched)?.box.width).toBeLessThan(placed?.box.width ?? 0);
    } finally {
      engine.destroy();
    }
  });

  it('DOCE-PAGINATION-11.9 DOCE-PAGINATION-12.10 keeps the number’s room while editing a projected table equation', () => {
    const equation: StoredNode = { type: 'mathBlock', attrs: { id: 'nested', source: 'x+y' } };
    const table: StoredNode = {
      type: 'table',
      content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [equation] }] }],
    };
    const firstEquation: StoredNode = { type: 'mathBlock', attrs: { source: 'x' } };
    const doc = read([...Array.from({ length: 8 }, () => firstEquation), table]);
    const block = blocksOf(doc).at(-1);
    const math = block?.lastChild?.lastChild?.lastChild?.lastChild;
    if (!block || math?.type.name !== 'math_display') throw new Error('No nested equation');
    const map = createProjectionMap(doc);
    const projection = EditorState.create({ doc });
    const canonical = EditorState.create({ doc: map.canonical });
    const routed = routeDomChange(projection.tr.insertText('+z', positionOf(doc, math) + 2), {
      projection,
      canonical,
      map,
    });
    if (!routed) throw new Error('No routed edit');
    const edited = blocksOf(routed.projection.doc).at(-1);
    const committed = blocksOf(routed.canonical.doc).at(-1);
    const editedMath = edited?.lastChild?.lastChild?.lastChild?.lastChild;
    const committedMath = committed?.lastChild?.lastChild?.lastChild?.lastChild;
    if (!edited || !editedMath || !committed || !committedMath)
      throw new Error('No edited equation');
    expect(editedMath).toMatchObject({ textContent: 'x+z+y' });
    expect(editedMath).not.toBe(committedMath);
    expect(editedMath.eq(committedMath)).toBe(true);

    const engine = engineOfEquations();
    try {
      engine.number(canonical.doc);
      engine.measureBlock(block, null);
      const end = engine.mathOf(math)?.end;
      expect(end).toBeGreaterThan(0);
      engine.nestedLines(edited, null);
      expect(engine.mathOf(editedMath)?.end).toBe(end);

      engine.number(routed.canonical.doc);
      engine.measureBlock(committed, null);
      engine.nestedLines(edited, null);
      expect(engine.mathOf(editedMath)?.end).toBe(end);
      expect(engine.mathOf(editedMath)?.box.width).toBe(engine.mathOf(committedMath)?.box.width);

      // Adding an earlier equation leaves the edited table intact in both documents.
      const oldDoc = routed.canonical.doc;
      const first = blocksOf(oldDoc)[0];
      if (!first) throw new Error('No preceding equation');
      const next = EditorState.create({ doc: oldDoc }).tr.insert(
        positionOf(oldDoc, first),
        first.type.create(first.attrs, first.content),
      ).doc;
      expect(blocksOf(next).at(-1)).toBe(committed);
      engine.number(next);
      engine.measureBlock(committed, null);
      const changed = engine.mathOf(committedMath);
      expect(changed?.end).toBeGreaterThan(end ?? 0);
      // Kept page drawing can read placement without asking nestedLines again.
      expect(engine.mathOf(editedMath)).toBe(changed);
    } finally {
      engine.destroy();
    }
  });

  it('DOCE-PAGINATION-10.8 DOCE-PAGINATION-14.4 lays out inline math with no layouter in its reserved box, never as drawn', () => {
    const doc = read([
      paragraph(text('aa '), { type: 'math_inline', content: [text('x^2')] }, text(' bb')),
    ]);
    const engine = engineOf();
    engine.number(doc);
    const block = blocksOf(doc)[0];
    if (!block) throw new Error('no block');
    expect(engine.measureBlock(block, null).height).toBeGreaterThan(0);
    expect(engine.stats()).toMatchObject({ laid: 1, refused: 0 });
    engine.destroy();
  });

  it('DOCE-PAGINATION-11.1 lays out every block of the stored documents, none left without room', () => {
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
    expect(laid).toBeGreaterThanOrEqual(721);
    // Nothing of a stored document takes no room (DOCE-PAGINATION-14.6).
    expect([...reasons]).toEqual([]);
  });

  it('DOCE-PAGINATION-14.6 DOCE-PAGINATION-5.16 gives a kept node the schema does not know no room, and reports it', () => {
    const doc = readDocumentFile(
      {
        formatVersion: 1,
        sections: [{ name: null, content: [{ type: 'plan', attrs: { id: 'kept-1' } }] }],
      },
      documentSchema,
      { unknown: 'keep' },
    ).doc;
    const engine = createPagesTextEngine({ template: BASE_TEMPLATE });
    engine.number(doc);
    const [block] = blocksOf(doc);
    if (!block) throw new Error('no kept block');
    expect(engine.measureBlock(block, null)).toMatchObject({
      height: 0,
      marginTop: 0,
      marginBottom: 0,
    });
    const reason = 'kept content the schema does not know takes no room';
    expect(engine.stats().reasons.get(reason)).toBe(1);
    expect([...(engine.stats().refusedNodes ?? new Map()).values()]).toEqual([reason]);
    engine.destroy();
  });

  it('DOCE-PAGINATION-11.11 DOCE-PAGINATION-14.6 lays a block holding words outside its text blocks out without them, and reports them', () => {
    // A quote whose deleted paragraph's words a comparison draws beside its rule, outside a text
    // block: the quote keeps the room of what it holds.
    const doc = readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [
              {
                type: 'blockquote',
                attrs: { id: 'quote' },
                content: [
                  { type: 'rule' },
                  {
                    type: 'paragraph',
                    attrs: { id: 'kept' },
                    content: [{ type: 'text', text: 'Kept' }],
                  },
                ],
              },
            ],
          },
        ],
      },
      documentSchema,
    ).doc;
    const engine = createPagesTextEngine({ template: BASE_TEMPLATE });
    engine.number(doc);
    const [quote] = blocksOf(doc);
    if (!quote) throw new Error('no quote');
    const plain = engine.measureBlock(quote, null).height;
    const inserted = { byBlock: new Map(), outside: new Set([quote]), key: 'outside' };
    expect(plain).toBeGreaterThan(0);
    expect(engine.measureBlock(quote, null, inserted).height).toBe(plain);
    const reason = 'inserted words outside a text block';
    expect(engine.stats().reasons.get(reason)).toBe(1);
    expect([...(engine.stats().refusedNodes ?? new Map()).values()]).toEqual([reason]);
    engine.destroy();
  });
});
