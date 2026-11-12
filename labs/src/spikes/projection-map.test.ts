// Check 6 of the projection spike: positions map exactly between a paged projection and its
// canonical whole document, on generated documents and layouts, and stay exact through generated
// edits made on either side and mirrored onto the other.

import type { Node } from 'prosemirror-model';
import { Transform } from 'prosemirror-transform';
import { describe, expect, it } from 'vitest';
import {
  type ContainerMeasurement,
  createLayoutRules,
  joinDocumentPages,
  type LayoutBlock,
  layoutPages,
  projectDocument,
  sameStructure,
  type TextMeasurement,
} from '../../../src/model/index.js';
import { documentSchema } from '../../../test/document-markup.js';
import { ProjectionMap } from './projection-map.js';

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
      const node = create('table', { dataId: id }, [
        row('table_header', 'Head'),
        ...Array.from({ length: rows }, (_, at) => row('table_cell', `R${String(at)}`)),
      ]);
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

describe('projection spike: position mapping (check 6)', () => {
  // 60 generated documents, in groups that each stay well inside the timeout on a loaded runner.
  it.each([1, 16, 31, 46])(
    'maps every character between a generated projection and its canonical document (documents %i on)',
    (first) => {
      for (let seed = first; seed < first + 15; seed += 1) {
        const rng = random(seed);
        const generated = generate(rng);
        const projection = project(rng, generated);
        const { map, whole } = ProjectionMap.of(projection);
        expect(sameStructure(whole, generated.whole), `seed ${String(seed)}`).toBe(true);
        expectExact(map, projection, whole);
      }
    },
  );

  // 1,000 edits in all: 40 documents of 25 edits, in groups that each stay well inside the timeout.
  it.each([1, 11, 21, 31])(
    'keeps the mapping exact through generated edits mirrored either way (documents %i on)',
    (first) => {
      let edits = 0;
      for (let seed = first; seed < first + 10; seed += 1) {
        const rng = random(seed * 7919);
        const projection = project(rng, generate(rng));
        const { map, whole } = ProjectionMap.of(projection);
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
        expectExact(ProjectionMap.of(pair.projection).map, pair.projection, pair.canonical);
      }
      expect(edits).toBe(250);
    },
  );

  it('finds footnote entries and repeated header rows again, which the page transform drops', () => {
    const rng = random(3);
    let redirected = 0;
    for (let seed = 0; seed < 20; seed += 1) {
      const projection = project(rng, generate(rng));
      const { map, whole } = ProjectionMap.of(projection);
      expectExact(map, projection, whole);
      redirected += map.counts.redirected;
      expect(map.counts.lost).toBe(0);
    }
    expect(redirected).toBeGreaterThan(0);
  });
});
