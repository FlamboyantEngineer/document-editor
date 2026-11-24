// A list of contents: its title, or what it shows when it lists nothing, then a row per entry with
// its number, text, leader and page, each row laid out by the text layout engine at its level's
// indentation and spacing, as the stylesheet's flex rows draw them. A row's page box keeps room for
// a fixed number of its font's `0`, whatever its page reads, so no row's height depends on the page
// numbers the layout itself comes to (DOCE-PAGINATION-10.11).

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { LayoutBlock } from '../../model/index.js';
import { lengthToCssPx } from '../../model/templates/template-css-values.js';
import type { ResolvedContentsList } from '../../model/templates/template-settings.js';
import { type BlockContext, type Laid, laid, notLaid } from './context.js';
import { stackContainer } from './stack.js';
import type { BlockTextLayout, ContentsList, ContentsListEntry } from './types.js';

/** Where a row sits from its list's top, and where each line of its text starts. */
export interface ContentsRowLayout {
  readonly top: number;
  readonly bottom: number;
  readonly starts: readonly number[];
}

/** The digits a page box keeps room for by default, up to page 999. */
export const PAGE_DIGITS = 3;

// The stylesheet's own numbers for a list: each level after the first 16px further in, 4px either
// side of a leader, 6px after a number, 8px under the title, 6px above a group's heading, and 12px
// under the list.
const LEVEL_INDENT = 16;
const LEADER_GAP = 4;
const NUMBER_GAP = 6;
const TITLE_AFTER = 8;
const GROUP_BEFORE = 6;
const LIST_AFTER = '12px';

const pixels = (length: unknown, fallback = '0px'): number =>
  Number.parseFloat(lengthToCssPx(length) ?? lengthToCssPx(fallback) ?? '0') || 0;

/** The page text a row is laid out with: its digits' room, whatever its page reads. */
export function reservedPage(digits: number): string {
  return '0'.repeat(Math.max(1, Math.floor(digits)));
}

type Settings = ResolvedContentsList;

function rowPlace(settings: Settings, at: { level: number; leader: boolean }) {
  const level = settings.levels[at.level - 1];
  const gaps = level?.leader;
  return {
    indentation: pixels(level?.indentation, `${String((at.level - 1) * LEVEL_INDENT)}px`),
    numberGap: NUMBER_GAP,
    leaderGaps:
      at.leader && gaps
        ? {
            before: pixels(gaps.gapBefore, `${String(LEADER_GAP)}px`),
            after: pixels(gaps.gapAfter, `${String(LEADER_GAP)}px`),
          }
        : null,
  };
}

interface RowAt {
  readonly node: ProseMirrorNode;
  readonly text: BlockTextLayout & Required<Pick<BlockTextLayout, 'layoutContentsRow'>>;
  readonly list: ContentsList;
  readonly settings: Settings;
  readonly width: number;
  readonly page: string;
}

// An entry's row, as a block of its own with its level's spacing.
function layRow(
  context: BlockContext,
  entry: ContentsListEntry,
  at: RowAt,
): LayoutBlock | { reason: string } {
  const { list, settings } = at;
  const level = Math.min(6, Math.max(1, entry.level || 1));
  const leader = list.showPage && Boolean(list.leaders[level - 1]);
  const page = list.showPage && !entry.heading ? at.page : undefined;
  const result = at.text.layoutContentsRow(
    {
      level,
      text: entry.text,
      ...(entry.number ? { number: entry.number } : {}),
      ...(entry.number && entry.text && list.separator ? { separator: list.separator } : {}),
      ...(page === undefined ? {} : { page }),
      ...(entry.heading ? { heading: true } : {}),
    },
    {
      width: at.width,
      kind: list.kind,
      scope: context.place.scope,
      ...rowPlace(settings, { level, leader }),
    },
  );
  if (!result.ok) return { reason: result.reason };
  const own = settings.levels[level - 1];
  const block: LayoutBlock = {
    node: at.node,
    height: result.table.height,
    marginTop: entry.heading ? GROUP_BEFORE : pixels(own?.spaceBefore),
    marginBottom: pixels(own?.spaceAfter),
    measurement: result.table.lines.map((line) => line.from),
  };
  return block;
}

// The title, or the empty message, as a block above the rows.
function layText(
  context: BlockContext,
  at: { node: ProseMirrorNode; list: ContentsList; width: number },
  { text, role }: { text: string; role: 'title' | 'empty' },
): LayoutBlock | { reason: string } {
  const { list, width } = at;
  const layout = context.options.text.layoutContentsText;
  if (!layout) return { reason: 'a list of contents title is not laid out by the engine yet' };
  const result = layout(text, { width, kind: list.kind, scope: context.place.scope, role });
  if (!result.ok) return { reason: result.reason };
  return {
    node: at.node,
    height: result.table.height,
    marginTop: 0,
    marginBottom: role === 'title' ? TITLE_AFTER : 0,
  };
}

/** A list of contents block: its title or empty message, then its rows, at its padding. */
export function layContents(context: BlockContext, node: ProseMirrorNode): Laid {
  const list = context.options.contentsOf?.(node);
  if (!list) return notLaid(node, 'a list of contents without its rows');
  const { text } = context.options;
  const { layoutContentsRow } = text;
  const settings = context.metrics.contents(list.kind);
  if (!layoutContentsRow) {
    return notLaid(node, 'list of contents rows are not laid out by the engine yet');
  }
  const width = Math.max(
    1,
    context.place.width - pixels(settings.padding.left) - pixels(settings.padding.right),
  );
  const blocks: LayoutBlock[] = [];
  for (const [role, value] of [
    ['title', list.title],
    ['empty', list.empty],
  ] as const) {
    if (value === null) continue;
    const block = layText(context, { node, list, width }, { text: value, role });
    if ('reason' in block) return notLaid(node, block.reason);
    blocks.push(block);
  }
  const heads = blocks.length;
  const digits = context.options.pageDigits?.() ?? PAGE_DIGITS;
  const rowAt: RowAt = {
    node,
    text: { ...text, layoutContentsRow },
    list,
    settings,
    width,
    page: reservedPage(digits),
  };
  for (const entry of list.entries) {
    const result = layRow(context, entry, rowAt);
    if ('reason' in result) return notLaid(node, result.reason);
    blocks.push(result);
  }
  const stacked = stackContainer(blocks, {
    marginTop: pixels(settings.spacing.top),
    marginBottom: pixels(settings.spacing.bottom, LIST_AFTER),
    top: 0,
    bottom: 0,
  });
  // Each row's box, and where each of its text's lines starts, which the pages draw it on.
  const placed: ContentsRowLayout[] = stacked.children
    .slice(heads)
    .map(({ top, bottom, measurement }) => ({
      top,
      bottom,
      starts: measurement as readonly number[],
    }));
  return laid({
    node,
    height: stacked.height,
    marginTop: stacked.marginTop,
    marginBottom: stacked.marginBottom,
    measurement: { rows: placed },
  });
}
