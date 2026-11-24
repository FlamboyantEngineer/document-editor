import { Fragment, type Node } from 'prosemirror-model';
import { Transform } from 'prosemirror-transform';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { joinDocumentPages, joinFragments, repaginate } from '../index.js';
import { FRAGMENT_RULES } from './fragments.js';

type Attrs = Record<string, unknown>;
const { nodes } = documentSchema;

function create(name: string, attrs: Attrs | null, content?: Node[] | string): Node {
  const type = nodes[name];
  if (!type) throw new Error(name);
  const children = typeof content === 'string' ? [documentSchema.text(content)] : content;
  return type.create(attrs, children);
}

// A seeded generator, so a failing case can be run again.
function random(seed: number) {
  let state = seed;
  return (limit: number) => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state % limit;
  };
}

// Whole blocks of words: paragraphs, and lists whose items hold paragraphs, with ids or without.
function wholeBlocks(next: (limit: number) => number): Node[] {
  let word = 0;
  const text = () =>
    Array.from({ length: 3 + next(12) }, () => `w${String((word += 1))}`).join(' ') + ' ';
  const id = (prefix: string) => (next(2) === 0 ? { dataId: `${prefix}${String(word)}` } : null);
  const paragraph = () => create('paragraph', id('p'), text());
  return Array.from({ length: 8 + next(10) }, () => {
    if (next(3) > 0) return paragraph();
    const items = Array.from({ length: 1 + next(4) }, () =>
      create('list_item', id('i'), Array.from({ length: 1 + next(2) }, paragraph)),
    );
    return create('bullet_list', id('l'), items);
  });
}

// Positions inside the text of `content`, never at a text node's edge, where a page break falls.
function breaks(content: Node, next: (limit: number) => number, count: number): number[] {
  const inside: number[] = [];
  content.descendants((node, pos) => {
    for (let offset = 1; node.isText && offset < node.nodeSize; offset += 1)
      inside.push(pos + offset);
  });
  const chosen = new Set<number>();
  while (chosen.size < Math.min(count, inside.length)) chosen.add(inside[next(inside.length)] ?? 0);
  return [...chosen].sort((left, right) => left - right);
}

// Marks the nodes a break cut as fragments: the ones down a part's first and last children, as far
// as the break before and after it reached, each with the number of breaks inside it before.
function marked(
  fragment: Fragment,
  edges: { left: readonly (number | null)[]; right: readonly (number | null)[] },
  depth = 0,
): Fragment {
  const nodesOf: Node[] = [];
  fragment.forEach((child, _offset, index) => {
    const part = [
      index === 0 ? edges.left[depth] : null,
      index === fragment.childCount - 1 ? edges.right[depth] : null,
    ].find((each) => each !== null && each !== undefined);
    const rule = Object.hasOwn(FRAGMENT_RULES, child.type.name);
    const attrs =
      rule && part !== undefined ? { ...child.attrs, splitPartIndex: part } : child.attrs;
    const inner = child.isTextblock
      ? child.content
      : marked(
          child.content,
          {
            left: index === 0 ? edges.left : [],
            right: index === fragment.childCount - 1 ? edges.right : [],
          },
          depth + 1,
        );
    nodesOf.push(child.type.create(attrs, inner, child.marks));
  });
  return Fragment.from(nodesOf);
}

// The blocks laid out on pages broken at `at`: each page holds what lies between two breaks.
function paged(blocks: readonly Node[], at: readonly number[]): Node {
  const content = create('page_content', null, [...blocks]);
  const counts = new Map<Node, number>();
  // For each break, the part number of each node it cuts, by depth, before and after it.
  const cuts = at.map((pos) => {
    const $pos = content.resolve(pos);
    const before: number[] = [];
    const after: number[] = [];
    for (let depth = 1; depth <= $pos.depth; depth += 1) {
      const node = $pos.node(depth);
      const count = counts.get(node) ?? 0;
      before.push(count);
      after.push(count + 1);
      counts.set(node, count + 1);
    }
    return { pos, before, after };
  });
  const edges = [0, ...at, content.content.size];
  const pages = edges.slice(1).map((end, index) => {
    const start = edges[index] ?? 0;
    const part = marked(content.content.cut(start, end), {
      left: cuts[index - 1]?.after ?? [],
      right: cuts[index]?.before ?? [],
    });
    return create('page', null, [
      create('page_header', null),
      create('page_content', null, children(part)),
      create('page_footnotes', null),
      create('page_footer', null),
    ]);
  });
  return create('doc', null, [create('page_section', { sectionName: 'Body' }, pages)]);
}

function children(node: Node | Fragment): Node[] {
  const list: Node[] = [];
  node.forEach((child) => list.push(child));
  return list;
}

function pageBlocks(doc: Node): Node[] {
  return children(doc.child(0)).flatMap((page) => children(page.child(1)));
}

// Every character of the paged text, mapped through the transform, lands on the same character.
function mapsText(before: Node, tr: Transform) {
  const misses: number[] = [];
  before.descendants((node, pos) => {
    for (let offset = 0; node.isText && offset < node.nodeSize; offset += 1) {
      const at = pos + offset;
      const mapped = tr.mapping.map(at);
      const char = before.textBetween(at, at + 1);
      if (tr.doc.textBetween(mapped, mapped + 1) !== char) misses.push(at);
    }
  });
  return misses;
}

describe('page transform', () => {
  it('DOCE-PAGINATION-6.7 joins pages and their fragments as joining the blocks in order does', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const next = random(seed);
      const blocks = wholeBlocks(next);
      const document = paged(
        blocks,
        breaks(create('page_content', null, blocks), next, 2 + next(14)),
      );
      const tr = joinDocumentPages(document);
      const joined = tr.doc.child(0).child(0).child(1);
      expect(
        joined.content.eq(Fragment.from(joinFragments(pageBlocks(document)))),
        `seed ${String(seed)}`,
      ).toBe(true);
      expect(mapsText(document, tr), `seed ${String(seed)}`).toEqual([]);
    }
  });

  it('DOCE-PAGINATION-6.7 joins a block split over many pages, its one item on each', () => {
    for (const ids of [false, true]) {
      const id = (dataId: string) => (ids ? { dataId } : null);
      const text = create('paragraph', id('p2'), 'a b c d e f g h i j k l m n');
      const long = create('list_item', id('i1'), [text]);
      const blocks = [
        create('paragraph', id('p1'), 'Lead text '),
        create('bullet_list', id('l1'), [long]),
      ];
      // Inside the item's text, at five places, so the item runs over six pages.
      const document = paged(blocks, [17, 21, 25, 29, 33]);
      expect(document.child(0).childCount).toBe(6);
      const tr = joinDocumentPages(document);
      const joined = tr.doc.child(0).child(0).child(1).content;
      expect(joined.eq(Fragment.from(joinFragments(pageBlocks(document))))).toBe(true);
      // With ids, every fragment finds the one before it however the joins went.
      if (ids) expect(joined.eq(Fragment.from(blocks))).toBe(true);
      expect(mapsText(document, tr)).toEqual([]);
    }
  });

  it('DOCE-PAGINATION-6.7 moves pages onto another layout of the same blocks, mapping each character', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const next = random(seed * 31);
      const blocks = wholeBlocks(next);
      const content = create('page_content', null, blocks);
      const current = paged(blocks, breaks(content, next, 2 + next(12)));
      const target = paged(blocks, breaks(content, next, 2 + next(12)));
      const tr = new Transform(current);
      repaginate(tr, target);
      expect(tr.doc.eq(target), `seed ${String(seed)}`).toBe(true);
      expect(mapsText(current, tr), `seed ${String(seed)}`).toEqual([]);
    }
  });
});
