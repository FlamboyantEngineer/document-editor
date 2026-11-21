// Laying a block's runs out on lines with Pretext, and the line table they make. Each prepared run
// is kept by its items, so a keystroke prepares only the run it changed, and its lines are kept by
// width, so the same text at two widths lays out once at each.

import { setLocale } from '@chenglou/pretext';
import {
  layoutNextRichInlineLineRange,
  materializeRichInlineLineRange,
  type PreparedRichInline,
  prepareRichInline,
  type RichInlineCursor,
} from '@chenglou/pretext/rich-inline';
import type { LineTable, TextLine } from './line-table.js';
import type { TextRun } from './runs.js';
import type { TextAlign } from './typography.js';

/** A run's line as Pretext broke it: where it starts in the run's items and how wide it is. */
interface RunLine {
  readonly item: number;
  readonly sourceStart: number;
  readonly width: number;
  /** The items the line holds, first to last. */
  readonly firstItem: number;
  readonly lastItem: number;
}

/** Prepared runs and their lines, kept between layouts. */
interface LineCache {
  /** Lays a run out at a width. */
  readonly lines: (run: TextRun, width: number) => readonly RunLine[];
}

/** How a block's lines are laid out. */
interface LineLayoutInput {
  readonly runs: readonly TextRun[];
  /** The content width, less the block's padding. */
  readonly width: number;
  readonly leading: number;
  readonly align: TextAlign;
  /** The block's padding on each side. */
  readonly padding: number;
}

/** How many prepared runs a cache keeps before it forgets the oldest. */
const CACHE_LIMIT = 4000;

const toEnd: RichInlineCursor = { itemIndex: 0, segmentIndex: 0, graphemeIndex: 0 };

function walk(prepared: PreparedRichInline, maxWidth: number): RunLine[] {
  const lines: RunLine[] = [];
  let cursor: RichInlineCursor = toEnd;
  for (;;) {
    const width = Math.max(1, maxWidth);
    const range = layoutNextRichInlineLineRange(prepared, width, cursor);
    if (!range) return lines;
    const { fragments } = materializeRichInlineLineRange(prepared, range);
    const first = fragments[0];
    lines.push({
      item: first?.itemIndex ?? 0,
      sourceStart: first?.sourceStart ?? 0,
      width: range.width,
      firstItem: first?.itemIndex ?? 0,
      lastItem: fragments.at(-1)?.itemIndex ?? 0,
    });
    cursor = range.end;
  }
}

/** A cache of prepared runs for one language, laid out in Pretext's pre-wrap white space. */
export function createLineCache(language: string | undefined): LineCache {
  const prepared = new Map<string, { run: PreparedRichInline; widths: Map<number, RunLine[]> }>();
  return {
    lines(run, width) {
      setLocale(language);
      const key = JSON.stringify(run.items);
      let entry = prepared.get(key);
      if (entry) prepared.delete(key);
      else
        entry = {
          run: prepareRichInline([...run.items], { whiteSpace: 'pre-wrap' }),
          widths: new Map(),
        };
      prepared.set(key, entry);
      if (prepared.size > CACHE_LIMIT) prepared.delete(prepared.keys().next().value ?? key);
      let lines = entry.widths.get(width);
      if (!lines) {
        lines = walk(entry.run, width);
        entry.widths.set(width, lines);
      }
      return lines;
    },
  };
}

function lineHeight(run: TextRun, line: RunLine | null, leading: number): number {
  if (!line) return leading;
  let height = leading;
  for (let index = line.firstItem; index <= line.lastItem; index += 1) {
    height = Math.max(height, run.atoms[index]?.height ?? 0);
  }
  return height;
}

// Where a line starts in its room. A justified line starts at the edge, as its last line does.
function alignedLeft(align: TextAlign, room: number, width: number): number {
  if (align === 'center') return Math.max(0, (room - width) / 2);
  if (align === 'right') return Math.max(0, room - width);
  return 0;
}

interface Placed {
  readonly from: number;
  readonly width: number;
  readonly height: number;
  readonly lastOfRun: boolean;
  readonly run: TextRun;
}

function runLines(cache: LineCache, input: LineLayoutInput, run: TextRun): Placed[] {
  const { width, leading } = input;
  const lines = run.items.length ? cache.lines(run, width) : [];
  if (!lines.length) return [{ from: run.start, width: 0, height: leading, lastOfRun: true, run }];
  return lines.map((line, index) => {
    const offset = run.offsets[line.item] ?? -1;
    return {
      from: offset < 0 ? run.start : offset + line.sourceStart,
      width: line.width,
      height: lineHeight(run, line, leading),
      lastOfRun: index === lines.length - 1,
      run,
    };
  });
}

/** The line table of a block's runs. */
export function layoutLines(cache: LineCache, input: LineLayoutInput): LineTable {
  const placed = input.runs.flatMap((run) => runLines(cache, input, run));
  const lines: TextLine[] = [];
  let top = 0;
  placed.forEach((line, index) => {
    const next = placed[index + 1];
    const left = alignedLeft(input.align, input.width, line.width);
    lines.push({
      from: line.from,
      to: line.lastOfRun ? line.run.end : (next?.from ?? line.run.end),
      width: line.width,
      left: input.padding + left,
      top,
      height: line.height,
      end: line.lastOfRun ? (line.run.endsWithBreak ? 'break' : 'end') : 'wrap',
    });
    top += line.height;
  });
  return {
    width: input.width + 2 * input.padding,
    lines,
    height: top,
    overhead: 2 * input.padding,
  };
}
