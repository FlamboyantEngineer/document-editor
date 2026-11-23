// A list of contents row laid out as the stylesheet's flex row draws it: the level's indentation,
// the entry's number and a gap, its text wrapping in the room left, then a leader of at least one
// `0` between two gaps and the page number, both on the text's last line.

import type { LineTable } from './line-table.js';
import { layoutLines, type LineCache } from './lines.js';
import type { Strut } from './metrics.js';
import type { TextRun } from './runs.js';
import { type BlockTypography, fontString } from './typography.js';

/** One entry of a list of contents. */
export interface ContentsRow {
  /** The entry's level, 1 to 6. */
  readonly level: number;
  /** The entry's number, such as a heading's `2.1`, drawn in a box before its text. */
  readonly number?: string | undefined;
  readonly text: string;
  /** The page the entry is on, or none for a row without one, such as a cited document's. */
  readonly page?: string | undefined;
  /** The list's separator, drawn after the number in place of its gap. */
  readonly separator?: string | undefined;
  /** Whether the row is a group heading, drawn bold. */
  readonly heading?: boolean | undefined;
}

/** Where a row is laid out, its lengths from the block geometry's metrics, in CSS pixels. */
export interface ContentsRowPlace {
  /** The row's width, its indentation included. */
  readonly width: number;
  /** The list's kind (`toc`, `figures` or a host's), whose settings the row takes. */
  readonly kind: string;
  /** The template section the list is in; the template's own scope when absent. */
  readonly scope?: string | null | undefined;
  /** The level's indentation. */
  readonly indentation: number;
  /** The gap after the number box. */
  readonly numberGap: number;
  /** The gaps before and after the leader, or null when the level draws no leader. */
  readonly leaderGaps: { readonly before: number; readonly after: number } | null;
}

/** A box of a row, from the row's left edge. */
interface RowBox {
  readonly left: number;
  readonly width: number;
}

/** A row's lines and where its number, leader and page are drawn. */
export interface ContentsRowTable {
  /** The text's lines, their `left` from the row's left edge. */
  readonly table: LineTable;
  readonly number: RowBox | null;
  /** After the number, when the row has both a number and a separator. */
  readonly separator: RowBox | null;
  /** On the text's last line, with the page. */
  readonly leader: RowBox | null;
  readonly page: RowBox | null;
}

/** What a row is laid out with: its typography, the line cache and its widths. */
interface RowEngine {
  readonly cache: LineCache;
  readonly typography: BlockTypography;
  readonly strut: Strut;
  readonly measure: (text: string, font: string) => number;
}

const LAYOUT_UNIT = 1 / 64;
/** A flex item's content width, as Chromium sizes it: its text's width up to the next layout unit. */
export const ceilUnit = (value: number) => Math.ceil(value / LAYOUT_UNIT - 1e-9) * LAYOUT_UNIT;
// A length in a font's `ch`, as Chromium keeps a minimum width: down to its layout unit.
const floorUnit = (value: number) => Math.floor(value / LAYOUT_UNIT + 1e-9) * LAYOUT_UNIT;

function textRun(text: string, font: string): TextRun {
  const items = text ? [{ text, font }] : [];
  return {
    start: 0,
    end: text.length,
    endsWithBreak: false,
    items,
    offsets: items.map(() => 0),
    atoms: items.map(() => null),
    sides: items.map(() => null),
  };
}

// Where the row's text starts: after the indentation, the number box and its separator or gap.
function textStart(engine: RowEngine, row: ContentsRow, place: ContentsRowPlace) {
  const font = fontString(engine.typography.font);
  const numberWidth = row.number ? ceilUnit(engine.measure(row.number, font)) : null;
  if (numberWidth === null) return { left: place.indentation, number: null, separator: null };
  const number = { left: place.indentation, width: numberWidth };
  const end = number.left + numberWidth;
  if (!row.separator) return { left: end + place.numberGap, number, separator: null };
  const separator = { left: end, width: ceilUnit(engine.measure(row.separator, font)) };
  return { left: end + separator.width, number, separator };
}

// The leader and page boxes after a text box, on the text's last line. Without a leader, the page
// follows the text box, as a flex row that holds only white space between them draws it.
function tailBoxes(
  { textEnd, pageWidth, minLeader }: { textEnd: number; pageWidth: number; minLeader: number },
  place: ContentsRowPlace,
): Pick<ContentsRowTable, 'leader' | 'page'> {
  const gaps = place.leaderGaps;
  if (!gaps) return { leader: null, page: { left: textEnd, width: pageWidth } };
  const pageLeft = place.width - pageWidth;
  const leaderLeft = textEnd + gaps.before;
  const leader = {
    left: leaderLeft,
    width: Math.max(minLeader, pageLeft - gaps.after - leaderLeft),
  };
  return { leader, page: { left: pageLeft, width: pageWidth } };
}

/** A row's text on lines, with its number, separator, leader and page boxes. */
export function layoutRow(
  engine: RowEngine,
  row: ContentsRow,
  place: ContentsRowPlace,
): ContentsRowTable {
  const font = fontString(engine.typography.font);
  const start = textStart(engine, row, place);
  const pageWidth = row.page === undefined ? null : ceilUnit(engine.measure(row.page, font));
  const minLeader = floorUnit(engine.measure('0', font));
  const gaps = place.leaderGaps;
  const leaderRoom = gaps ? gaps.before + minLeader + gaps.after : 0;
  const tail = pageWidth === null ? 0 : leaderRoom + pageWidth;
  const room = Math.max(1, place.width - start.left - tail);
  const lines = layoutLines(engine.cache, {
    runs: [textRun(row.text, font)],
    width: room,
    leading: engine.typography.leading,
    strut: engine.strut,
    align: 'left',
    padding: 0,
    firstStart: 0,
    restStart: 0,
    block: row,
  });
  // The text shrinks to the room left when it wraps; on one line it takes its own width.
  const textBox =
    lines.lines.length > 1 ? room : Math.min(room, ceilUnit(lines.lines[0]?.width ?? 0));
  const table: LineTable = {
    ...lines,
    width: place.width,
    lines: lines.lines.map((line) => ({ ...line, left: start.left + line.left })),
  };
  const textEnd = start.left + textBox;
  return {
    table,
    number: start.number,
    separator: start.separator,
    ...(pageWidth === null
      ? { leader: null, page: null }
      : tailBoxes({ textEnd, pageWidth, minLeader }, place)),
  };
}

/** A list of contents' title or empty message on lines at its width, wrapping as a paragraph does. */
export function layoutContentsText(engine: RowEngine, text: string, width: number): LineTable {
  return layoutLines(engine.cache, {
    runs: [textRun(text, fontString(engine.typography.font))],
    width: Math.max(1, width),
    leading: engine.typography.leading,
    strut: engine.strut,
    align: engine.typography.align,
    padding: 0,
    firstStart: 0,
    restStart: 0,
    // Prepared by its text alone: the cache keeps recent runs for text a new owner repeats.
    block: {},
  });
}
