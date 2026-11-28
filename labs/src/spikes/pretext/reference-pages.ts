// The verification path's own page fill (DOCE-LABS-5.2): the pages natural HTML gives, from the
// blocks and lines the browser drew, by the lab's layout rules written out again here. It shares
// no code with the prediction's packer (`indexPages`, `layoutPages`), so a fault in that packer,
// such as pages filled short of their room, shows as different page boundaries.
import { type Block, blockId } from './prediction.js';

// A page's used height is a sum of fractional CSS pixels, kept at a thousandth of a pixel so it
// stays stable, as the layout rules keep it.
const thousandth = (value: number) => Math.round(value * 1000) / 1000;

/** A block's part: its lines from `first` up to `end`, or the whole of a block without lines. */
interface Part {
  readonly index: number;
  readonly block: Block;
  readonly first: number;
  readonly end: number;
}

/** A page's fragment, as `[source, from, to]`: the block's id or index, and content offsets. */
export type Boundary = [string, number, number];

const lineCount = (block: Block) => block.lines?.length ?? 0;
const whole = (part: Part) => part.first === 0 && part.end === lineCount(part.block);
const continued = (part: Part) => part.first > 0;
const leadingOf = (block: Block) =>
  block.leading ?? (lineCount(block) ? block.height / lineCount(block) : 0);
const height = (part: Part) =>
  whole(part) ? part.block.height : (part.end - part.first) * leadingOf(part.block);
const before = (part: Part) => (part.first === 0 ? part.block.before : 0);
const after = (part: Part) => (part.end === lineCount(part.block) ? part.block.after : 0);

function level(part: Part | undefined): number | null {
  const node = part?.block.node;
  if (node?.type.name !== 'heading' || part?.first) return null;
  if (node.attrs.docTitle) return 0;
  const value = Number(node.attrs.level);
  return Number.isFinite(value) && value >= 1 ? value : 1;
}

// The height parts take stacked, margins between them collapsed, from a page's top.
function stacked(parts: readonly Part[]) {
  return thousandth(
    parts.reduce((sum, part, at) => {
      const above = parts[at - 1];
      return sum + height(part) + (above ? Math.max(after(above), before(part), 0) : 0);
    }, 0),
  );
}

// The room left for `next` below a page's parts and the gap before it.
function free(page: readonly Part[], next: Part, room: number) {
  const last = page.at(-1);
  const gap = last ? Math.max(after(last), before(next), 0) : 0;
  return room - stacked(page) - gap;
}

// How many of a paragraph part's lines fit `space`, keeping two on each side; 0 when none can.
function linesFitting(part: Part, space: number): number {
  if (part.block.node.type.name !== 'paragraph' || !lineCount(part.block)) return 0;
  const lines = Math.min(Math.floor(space / leadingOf(part.block)), part.end - part.first - 2);
  return lines >= 2 ? lines : 0;
}

// The headings at the queue's front, each deeper than the one before, and the block they head.
function headingGroup(queue: readonly Part[]): Part[] {
  const group: Part[] = [];
  for (const part of queue) {
    const depth = level(part);
    const above = level(group.at(-1));
    if (group.length && above === null) break;
    if (depth !== null && above !== null && depth <= above) break;
    group.push(part);
    if (depth === null) break;
  }
  return group;
}

// Whether a heading leaves for the next page with what it heads: they do not fit whole, and the
// headed block neither fits whole after the headings nor leaves two lines below them.
function headingMoves(page: readonly Part[], queue: readonly Part[], room: number) {
  if (!page.length || level(queue[0]) === null) return false;
  const group = headingGroup(queue);
  const fits = (parts: readonly Part[]) => stacked([...page, ...parts]) <= room;
  if (fits(group)) return false;
  const lead = group.at(-1);
  if (!lead || level(lead) !== null) return true;
  const headings = group.slice(0, -1);
  if (!fits(headings)) return true;
  const space = free([...page, ...headings], lead, room);
  return !linesFitting(lead, space);
}

/** The pages the measured blocks fill, `room` tall, by the lab's layout rules. */
export function referencePages(blocks: readonly Block[], room: number): Part[][] {
  const queue: Part[] = blocks.map((block, index) => ({
    index,
    block,
    first: 0,
    end: lineCount(block),
  }));
  const pages: Part[][] = [];
  while (queue.length) {
    const page: Part[] = [];
    for (let next = queue[0]; next; next = queue[0]) {
      if (page.length && (continued(next) || headingMoves(page, queue, room))) break;
      const space = free(page, next, room);
      if (height(next) <= space) {
        page.push(queue.shift() ?? next);
        continue;
      }
      const lines = linesFitting(next, space);
      if (lines) {
        page.push({ ...next, end: next.first + lines });
        queue[0] = { ...next, first: next.first + lines };
        break;
      }
      if (page.length) break;
      page.push(queue.shift() ?? next);
    }
    pages.push(page);
  }
  return pages;
}

/** Each page's fragments as `[source, from, to]`. */
export function referenceBoundaries(pages: readonly (readonly Part[])[]): Boundary[][] {
  return pages.map((page) =>
    page.map(({ index, block, first, end }) => {
      const offset = (line: number) =>
        line >= lineCount(block) ? block.node.content.size : (block.lines?.[line]?.from ?? 0);
      return [blockId(block.node) ?? String(index), first ? offset(first) : 0, offset(end)];
    }),
  );
}

/**
 * The first page whose boundaries differ, and how the prediction ended it: `short` when it ended
 * the page before the reference does, leaving room it fills, `long` when after.
 */
export function divergence(
  predicted: readonly (readonly Boundary[])[],
  html: readonly (readonly Boundary[])[],
  page: number | undefined,
) {
  if (page === undefined) return null;
  const sources = new Map<string, number>();
  for (const [source] of [...predicted, ...html].flat())
    if (!sources.has(source)) sources.set(source, sources.size);
  // Where a page ends, as its last fragment's source position and end offset.
  const end = (parts: readonly Boundary[] | undefined) => {
    const last = parts?.at(-1);
    return last ? [sources.get(last[0]) ?? 0, last[2]] : [-1, -1];
  };
  const [predictedBlock = 0, predictedTo = 0] = end(predicted[page - 1]);
  const [htmlBlock = 0, htmlTo = 0] = end(html[page - 1]);
  const ends = predictedBlock - htmlBlock || predictedTo - htmlTo;
  return {
    page,
    predicted: predicted[page - 1] ?? [],
    html: html[page - 1] ?? [],
    ends: ends < 0 ? 'short' : ends > 0 ? 'long' : 'same end',
  } as const;
}
