import type { Node } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { Transform } from 'prosemirror-transform';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { positionOf, textOf } from '../../test/projection-fixtures.js';
import {
  type ContainerMeasurement,
  createLayoutRules,
  joinDocumentPages,
  type LayoutBlock,
  layoutPages,
  projectDocument,
  repaginate,
  sameStructure,
  type TextMeasurement,
} from '../model/index.js';
import { splitTableFigureWith } from '../model/pagination/table-split.js';
import { footnoteCopies } from './footnote-positions.js';
import { routeDomChange } from './projection-input.js';
import { createProjectionMap, type ProjectionMap } from './projection-map.js';
import { canonicalSelection, nearAfter, projectionSelection } from './selection-mirror.js';

type Attrs = Record<string, unknown>;

function random(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(values: readonly T[]): T => values[Math.floor(next() * values.length)] as T,
  };
}
type Random = ReturnType<typeof random>;

const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu'.split(' ');
const LINE = 10;
const CHARS_PER_LINE = 12;

function create(name: string, attrs: Attrs | null, content?: Node[] | string): Node {
  const type = documentSchema.nodes[name];
  if (!type) throw new Error(name);
  const children = typeof content === 'string' ? [documentSchema.text(content)] : content;
  return type.create(attrs, children);
}

const words = (rng: Random, count: number) =>
  Array.from({ length: count }, () => rng.pick(WORDS)).join(' ');

// Text laid out twelve characters to a line, ten pixels a line.
const textMeasurement = (offset = 0): TextMeasurement => ({
  offset,
  measure: (from, to) => {
    const lines = Math.max(1, Math.ceil((to - from) / CHARS_PER_LINE));
    return { height: lines * LINE, lines };
  },
});

interface Generated {
  readonly whole: Node;
  readonly blocks: LayoutBlock[];
}

// A whole document of paragraphs, some citing footnotes, and tables with a header row, measured.
function generate(rng: Random): Generated {
  const blocks: LayoutBlock[] = [];
  const entries: Node[] = [];
  const count = rng.int(4, 14);
  for (let index = 0; index < count; index += 1) {
    const id = `b${String(index)}`;
    if (rng.next() < 0.25) {
      const rows = rng.int(3, 12);
      const cell = (type: string, text: string) =>
        create(type, null, [create('paragraph', null, text)]);
      const row = (type: string, prefix: string) =>
        create('table_row', null, [cell(type, `${prefix} one`), cell(type, `${prefix} two`)]);
      const table = create('table', { dataId: id }, [
        row('table_header', 'Head'),
        ...Array.from({ length: rows }, (_, at) => row('table_cell', `R${String(at)}`)),
      ]);
      const caption = create('table_caption', { dataId: `c${String(index)}` }, `Cap ${id}`);
      const node = create('table_figure', null, [caption, table]);
      const measurement: ContainerMeasurement = {
        children: Array.from({ length: rows + 1 }, (_, at) => ({
          top: at * 20,
          bottom: at * 20 + 20,
        })),
      };
      blocks.push({ node, height: (rows + 1) * 20, marginTop: 4, marginBottom: 4, measurement });
      continue;
    }
    const text = words(rng, rng.int(3, 40));
    const content: Node[] = [documentSchema.text(text)];
    if (rng.next() < 0.3) {
      const footnoteId = `n${String(index)}`;
      content.push(create('footnote_reference', { footnoteId }));
      content.push(documentSchema.text(` ${words(rng, rng.int(1, 6))}`));
      entries.push(create('footnote_entry', { footnoteId }, `Note ${words(rng, rng.int(1, 5))}`));
    }
    const node = create('paragraph', { dataId: id }, content);
    const lines = Math.max(1, Math.ceil(node.textContent.length / CHARS_PER_LINE));
    blocks.push({
      node,
      height: lines * LINE,
      marginTop: 4,
      marginBottom: 4,
      measurement: textMeasurement(),
    });
  }
  const page = create('page', null, [
    create('page_header', null),
    create(
      'page_content',
      null,
      blocks.map((block) => block.node),
    ),
    create('page_footnotes', null, entries),
    create('page_footer', null),
  ]);
  const whole = create('doc', null, [create('page_section', { sectionName: 'Body' }, [page])]);
  return { whole, blocks };
}

function project(rng: Random, { whole, blocks }: Generated): Node {
  const pages = layoutPages(blocks, { pageHeight: rng.int(50, 140), rules: createLayoutRules() });
  return projectDocument(whole, [pages.map((page) => page.map((block) => block.node))]);
}

// Every position just before a character of text, in document order.
function textPositions(doc: Node): number[] {
  const positions: number[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    for (let at = 0; at < (node.text?.length ?? 0); at += 1) positions.push(pos + at);
    return false;
  });
  return positions;
}

const charAt = (doc: Node, pos: number) => doc.textBetween(pos, pos + 1);

// Every character on one side maps onto the same character on the other, both ways.
function expectExact(map: ProjectionMap, projection: Node, canonical: Node) {
  for (const pos of textPositions(projection)) {
    const mapped = map.toCanonical(pos);
    expect(mapped, `projection ${String(pos)}`).not.toBeNull();
    expect(charAt(canonical, mapped ?? -1)).toBe(charAt(projection, pos));
  }
  for (const pos of textPositions(canonical)) {
    const mapped = map.toProjection(pos);
    expect(mapped, `canonical ${String(pos)}`).not.toBeNull();
    expect(charAt(projection, mapped ?? -1)).toBe(charAt(canonical, pos));
  }
}

// A generated edit on the canonical document: insert words, delete a run inside one textblock,
// which may cross a page break, or bold a run.
function canonicalEdit(rng: Random, canonical: Node): Transform | null {
  const positions = textPositions(canonical);
  if (!positions.length) return null;
  const pos = rng.pick(positions);
  const $pos = canonical.resolve(pos);
  const end = Math.min($pos.end(), pos + rng.int(1, 30));
  const tr = new Transform(canonical);
  const kind = rng.next();
  if (kind < 0.5) tr.insert(pos, documentSchema.text(`${rng.pick(WORDS)} `));
  else if (kind < 0.8) tr.delete(pos, end);
  else {
    const bold = documentSchema.marks.bold;
    if (!bold) return null;
    tr.addMark(pos, end, bold.create());
  }
  return tr;
}

interface Pair {
  map: ProjectionMap;
  projection: Node;
  canonical: Node;
}

// Applies a canonical edit and mirrors each of its steps onto the projection.
function mirrorCanonical(pair: Pair, tr: Transform): boolean {
  let { map, projection, canonical } = pair;
  for (const step of tr.steps) {
    const applied = step.apply(canonical);
    if (!applied.doc) return false;
    const mirrored = map.mirror(step, applied.doc);
    if (!mirrored) return false;
    canonical = applied.doc;
    ({ projection, map } = mirrored);
  }
  Object.assign(pair, { map, projection, canonical });
  return true;
}

// Typing on the projection: the step goes to the canonical document, and that step is mirrored back,
// as the projection's dispatch refuses its own edits.
function routeProjectionInput(rng: Random, pair: Pair): boolean {
  const positions = textPositions(pair.projection);
  if (!positions.length) return true;
  const typed = new Transform(pair.projection).insert(
    rng.pick(positions),
    documentSchema.text(rng.pick(WORDS)),
  );
  const step = typed.steps[0];
  const routed = step ? pair.map.mapStep(step, 'toCanonical') : null;
  if (!routed) return false;
  return mirrorCanonical(pair, new Transform(pair.canonical).step(routed));
}

function repeatedNote(blocks = [['First'], ['Second']]) {
  const entries = create('page_footnotes', null, [
    create('footnote_entry', { footnoteId: 'note' }, 'One two three.'),
  ]);
  const pages = blocks.map((body) =>
    create('page', null, [
      create('page_header', null),
      create(
        'page_content',
        null,
        body.map((text) => create('paragraph', null, text)),
      ),
      entries,
      create('page_footer', null),
    ]),
  );
  return create('doc', null, [create('page_section', null, pages)]);
}

function secondNote(doc: Node) {
  const copy = footnoteCopies(doc, 'note')[1];
  if (!copy) throw new Error('The second note is missing');
  return copy;
}

// The property tests walk every character of generated documents after each edit: under a second
// each here, but several times slower on CI's runners beside the other test files, so they get 30 s.
describe('projection map', { timeout: 30_000 }, () => {
  it.each(['inside the replacement', 'after the replacement'] as const)(
    'DOCE-PAGINATION-7.9 preserves the browser selection %s when an edit echoes across a page break',
    (where) => {
      const fragments = ['ABCD', 'EFGH'].map((text, index) =>
        create('paragraph', { dataId: 'split', splitPartIndex: index }, text),
      );
      const tail = create('paragraph', { dataId: 'tail' }, 'Trailing');
      const pages = fragments.map((fragment, index) =>
        create('page', null, [
          create('page_header', null),
          create('page_content', null, index ? [fragment, tail] : [fragment]),
          create('page_footnotes', null),
          create('page_footer', null),
        ]),
      );
      const doc = create('doc', null, [create('page_section', null, pages)]);
      const map = createProjectionMap(doc);
      const projection = EditorState.create({ doc });
      const canonical = EditorState.create({ doc: map.canonical });
      const tr = projection.tr.insertText(
        'x'.repeat(200),
        positionOf(doc, 'C'),
        positionOf(doc, 'G'),
      );
      const selected = (document: Node) =>
        where === 'inside the replacement'
          ? positionOf(document, 'xxx') + 100
          : positionOf(document, 'Trailing') + 1;
      tr.setSelection(TextSelection.create(tr.doc, selected(tr.doc)));
      const routed = routeDomChange(tr, { map, canonical, projection });
      if (!routed) throw new Error('The edit should route.');
      expect(routed.projection.steps.length).toBeGreaterThan(1);
      expect(routed.projection.selection.head).toBe(selected(routed.projection.doc));
      expect(routed.canonical.selection.head).toBe(selected(routed.canonical.doc));
    },
  );

  it('DOCE-PAGINATION-1.8 preserves positions in both columns through joining and repagination', () => {
    const column = (id: string, part: number, value: string) =>
      create('layout_column', null, [
        create('paragraph', { dataId: id, splitPartIndex: part }, value),
      ]);
    const pages = [0, 1, 2].map((part) =>
      create('page', null, [
        create('page_header', null),
        create('page_content', null, [
          create('layout_section', { preset: 'halves', splitPartIndex: part }, [
            column('left', part, ['alpha ', 'bravo ', 'charlie'][part] ?? ''),
            column('right', part, ['delta ', 'echo ', 'foxtrot'][part] ?? ''),
          ]),
        ]),
        create('page_footnotes', null),
        create('page_footer', null),
      ]),
    );
    const paged = create('doc', null, [create('page_section', null, pages)]);
    const map = createProjectionMap(paged);
    expect(textOf(map.canonical)).toBe('alpha bravo charliedelta echo foxtrot');
    expectExact(map, paged, map.canonical);
    const split = new Transform(map.canonical);
    repaginate(split, paged);
    expect(split.doc.eq(paged)).toBe(true);
    for (const pos of textPositions(map.canonical)) {
      const at = split.mapping.mapResult(pos, 1);
      expect(at.deletedAcross).toBe(false);
      expect(charAt(split.doc, at.pos)).toBe(charAt(map.canonical, pos));
    }
  });

  it('DOCE-PAGINATION-4.5 DOCE-PAGINATION-7.9 keeps a header-shaped body row independent', () => {
    const cell = (text: string, header = false, rowspan = 1) =>
      create(header ? 'table_header' : 'table_cell', { rowspan }, [
        create('paragraph', null, text),
      ]);
    const row = (id: string, ...cells: Node[]) => create('table_row', { dataId: id }, cells);
    const table = create('table_figure', null, [
      create('table_caption', null),
      create('table', { dataId: 'spanning-table' }, [
        row('original-header', cell('H1', true, 2), cell('H2', true)),
        row('mixed-body', cell('Bridge')),
        row('header-like-body', cell('Other', true), cell('Heading', true)),
        row('body-one', cell('One'), cell('Two')),
        row('body-two', cell('Three'), cell('Four')),
      ]),
    ]);
    const split = splitTableFigureWith(true);
    const first = split(
      {
        node: table,
        height: 100,
        marginTop: 0,
        marginBottom: 0,
        measurement: {
          children: Array.from({ length: 5 }, (_, i) => ({ top: i * 20, bottom: (i + 1) * 20 })),
        },
      },
      40,
    );
    const tail = first?.tail[0];
    if (!first || !tail) throw new Error('The table should span multiple pages.');
    expect(textOf(tail.node)).toBe('OtherHeadingOneTwoThreeFour');
    const next = split(tail, 20);
    expect(next?.head.node.textContent).toBe('OtherHeading');
    expect(next?.tail[0]?.node.textContent).toBe('OneTwoThreeFour');

    const page = create('page', null, [
      create('page_header', null),
      create('page_content', null, [table]),
      create('page_footnotes', null),
      create('page_footer', null),
    ]);
    const whole = create('doc', null, [create('page_section', null, [page])]);
    const projected = projectDocument(whole, [[[first.head.node], [tail.node]]]);
    const map = createProjectionMap(projected);
    expect(sameStructure(map.canonical, whole)).toBe(true);
    expectExact(map, projected, map.canonical);

    const at = positionOf(map.canonical, 'H1');
    const canonical = new Transform(map.canonical).insert(at, documentSchema.text('Edited '));
    const [step] = canonical.steps;
    if (!step) throw new Error('The header should be editable.');
    const mirrored = map.mirror(step, canonical.doc);
    expect(mirrored?.steps).toHaveLength(1);
    expect(mirrored && textOf(mirrored.projection)).toBe(
      'Edited H1H2BridgeOtherHeadingOneTwoThreeFour',
    );
    if (!mirrored) throw new Error('The header edit should map.');
    expectExact(mirrored.map, mirrored.projection, canonical.doc);
  });

  it('DOCE-PAGINATION-7.9 routes every step from a later copy to the same footnote', () => {
    const doc = repeatedNote();
    const map = createProjectionMap(doc);
    const { from } = secondNote(doc);
    const projection = EditorState.create({
      doc,
      selection: TextSelection.create(doc, from + 4),
    });
    const selection = canonicalSelection(map, projection.selection, map.canonical);
    if (!selection) throw new Error('The note selection should map');
    const canonical = EditorState.create({ doc: map.canonical, selection });
    const tr = projection.tr.insertText('longer ', from + 4);
    tr.insertText(' than before', from + 20);
    const routed = routeDomChange(tr, { map, canonical, projection });
    expect(routed && textOf(routed.canonical.doc)).toBe(
      'FirstSecondOne longer two three than before.',
    );
    expect(routed && textOf(routed.projection.doc)).toBe(
      'FirstOne longer two three than before.SecondOne longer two three than before.',
    );
  });

  it('DOCE-PAGINATION-7.9 keeps the selected range in a repeated footnote after reflow', () => {
    const doc = repeatedNote([['First', 'Filler'], ['Second']]);
    const map = createProjectionMap(doc);
    const copy = secondNote(doc);
    const selection = TextSelection.create(doc, copy.from + 4, copy.from + 7);
    const tr = EditorState.create({ doc, selection }).tr;
    repaginate(tr, repeatedNote([['First'], ['Filler', 'Second']]));
    const reflowed = createProjectionMap(tr.doc);
    const canonical = canonicalSelection(map, selection, map.canonical);
    if (!canonical) throw new Error('The note selection should map');
    const at = secondNote(tr.doc).from;
    const near = nearAfter(selection, tr);
    expect([near.from, near.to]).toEqual([at + 4, at + 7]);
    expect(projectionSelection(reflowed, canonical, near).eq(near)).toBe(true);
  });

  // 60 generated documents, in groups that each stay well inside the timeout on a loaded runner.
  it.each([1, 16, 31, 46])(
    'DOCE-PAGINATION-7.9 maps every character between a generated projection and its canonical document (documents %i on)',
    (first) => {
      for (let seed = first; seed < first + 15; seed += 1) {
        const rng = random(seed);
        const generated = generate(rng);
        const projection = project(rng, generated);
        const map = createProjectionMap(projection);
        const whole = map.canonical;
        expect(sameStructure(whole, generated.whole), `seed ${String(seed)}`).toBe(true);
        expectExact(map, projection, whole);
      }
    },
  );

  // 1,000 edits in all: 40 documents of 25 edits, in groups that each stay well inside the timeout.
  it.each([1, 11, 21, 31])(
    'DOCE-PAGINATION-7.9 keeps the mapping exact through generated edits mirrored either way (documents %i on)',
    (first) => {
      let edits = 0;
      for (let seed = first; seed < first + 10; seed += 1) {
        const rng = random(seed * 7919);
        const projection = project(rng, generate(rng));
        const map = createProjectionMap(projection);
        const whole = map.canonical;
        const pair: Pair = { map, projection, canonical: whole };
        for (let step = 0; step < 25; step += 1) {
          const fromProjection = rng.next() < 0.4;
          const tr = fromProjection ? null : canonicalEdit(rng, pair.canonical);
          const ok = fromProjection
            ? routeProjectionInput(rng, pair)
            : !tr || mirrorCanonical(pair, tr);
          expect(ok, `seed ${String(seed)} edit ${String(step)}`).toBe(true);
          edits += 1;
          const joined = joinDocumentPages(pair.projection).doc;
          expect(
            sameStructure(joined, pair.canonical),
            `seed ${String(seed)} edit ${String(step)}`,
          ).toBe(true);
        }
        expectExact(pair.map, pair.projection, pair.canonical);
        // A layout rebuilds the map from the page transform and starts it over.
        expectExact(createProjectionMap(pair.projection), pair.projection, pair.canonical);
      }
      expect(edits).toBe(250);
    },
  );
});
