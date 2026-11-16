// Typed numbers taken off the start of imported headings, since the template numbers headings:
// decimal and appendix hierarchies (`1.2.3`, `A.1`), punctuated numbers, Roman numerals and letters
// (`4.`, `IV.`, `B)`), and a bare number before a tab, each followed by white space, even across
// runs of different formatting. A bare number before a space is a heading number only where the
// headings at its level under one parent count up from 1 and there are two of them or a subheading
// continues the count, so `2024 Results` or `747 Fleet Data` stay as they are.

import type { StoredNode } from '../../model/format/document-format.js';
import type { ImportWarnings } from '../import-warnings.js';

const PREFIXES: readonly RegExp[] = [
  /^\d+(?:\.\d+)+\.?(?=\s)/,
  /^[A-Z](?:\.\d+)+\.?(?=\s)/,
  /^\d+[.)](?=\s)/,
  /^[IVXLCDM]+[.)](?=\s)/,
  /^[A-Za-z][.)](?=\s)/,
  /^\d+(?=\t)/,
];

const BARE = /^(\d+)(?= )/;

// The text a heading starts with, up to its first node that is not text.
function leadingText(heading: StoredNode): string {
  let text = '';
  for (const node of heading.content ?? []) {
    if (node.type !== 'text') break;
    text += node.text ?? '';
  }
  return text;
}

// The heading with its first `length` characters taken off, across its text nodes, in place, so
// the bookmarks that name it still do.
function takeLead(heading: StoredNode, length: number): void {
  let left = length;
  const content: StoredNode[] = [];
  for (const node of heading.content ?? []) {
    if (left > 0 && node.type === 'text') {
      const text = node.text ?? '';
      const kept = text.slice(left);
      left -= text.length - kept.length;
      if (kept) content.push({ ...node, text: kept });
    } else content.push(node);
  }
  if (content.length) heading.content = content;
  else delete heading.content;
}

// How many characters of a heading's text are its typed number and the space after it.
function prefixLength(text: string, bareCounts: boolean): number {
  const typed = PREFIXES.map((prefix) => prefix.exec(text)?.[0]).find(Boolean);
  const number = typed ?? (bareCounts ? BARE.exec(text)?.[0] : undefined);
  if (!number) return 0;
  return number.length + (/^\s*/.exec(text.slice(number.length))?.[0].length ?? 0);
}

interface Placed {
  readonly at: number;
  readonly level: number;
  readonly parent: number;
}

// Each heading of a run of blocks with its level and the index of the heading it sits under.
function placeHeadings(blocks: readonly StoredNode[]): Placed[] {
  const placed: Placed[] = [];
  const stack: Placed[] = [];
  blocks.forEach((block, at) => {
    if (block.type !== 'heading' || block.attrs?.title === true) return;
    const level = typeof block.attrs?.level === 'number' ? block.attrs.level : 1;
    while (stack.length && (stack[stack.length - 1]?.level ?? 0) >= level) stack.pop();
    const heading = { at, level, parent: stack[stack.length - 1]?.at ?? -1 };
    placed.push(heading);
    stack.push(heading);
  });
  return placed;
}

// The headings whose bare numbers before a space count: every heading of a level under one parent
// numbered 1, 2, 3 in order, two at least or a subheading continuing the first's number.
function countedHeadings(blocks: readonly StoredNode[], placed: readonly Placed[]): Set<number> {
  const groups = new Map<string, Placed[]>();
  for (const heading of placed) {
    const key = `${String(heading.parent)}:${String(heading.level)}`;
    groups.set(key, [...(groups.get(key) ?? []), heading]);
  }
  const counted = new Set<number>();
  for (const group of groups.values()) {
    const numbers = group.map(
      (heading) => BARE.exec(leadingText(blocks[heading.at] ?? { type: 'heading' }))?.[1],
    );
    const counts = numbers.every((number, index) => number === String(index + 1));
    const first = group[0];
    const continued =
      !!first &&
      placed.some(
        (child) =>
          child.parent === first.at &&
          leadingText(blocks[child.at] ?? { type: 'heading' }).startsWith(`${numbers[0] ?? ''}.`),
      );
    if (counts && (group.length >= 2 || continued))
      for (const heading of group) counted.add(heading.at);
  }
  return counted;
}

/**
 * A run of blocks with the typed numbers taken off its headings, in place, each removal reported
 * as `heading-number-removed`; the rest of each heading's text and its marks stay.
 */
export function stripHeadingNumbers(
  blocks: readonly StoredNode[],
  warnings: ImportWarnings,
): StoredNode[] {
  const placed = placeHeadings(blocks);
  const counted = countedHeadings(blocks, placed);
  for (const { at } of placed) {
    const heading = blocks[at];
    const length = heading ? prefixLength(leadingText(heading), counted.has(at)) : 0;
    if (!heading || !length) continue;
    takeLead(heading, length);
    warnings.add('heading-number-removed');
  }
  return [...blocks];
}
