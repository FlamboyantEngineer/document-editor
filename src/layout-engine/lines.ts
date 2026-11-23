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
import type { Strut } from './metrics.js';
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
  /** Lays a run out at its first line's width and the other lines' width. */
  readonly lines: (run: TextRun, widths: LineWidths) => readonly RunLine[];
  /** How many runs were found prepared, and how many had to be prepared. */
  readonly stats: () => CacheStats;
}

/** A cache's prepared-run counts since it was made. */
export interface CacheStats {
  readonly hits: number;
  readonly misses: number;
}

/** The width of a run's first line and of its other lines. */
interface LineWidths {
  readonly first: number;
  readonly rest: number;
}

/** How a block's lines are laid out. */
interface LineLayoutInput {
  readonly runs: readonly TextRun[];
  /** The content width, less the block's padding. */
  readonly width: number;
  readonly leading: number;
  /** The line box every line grows from. */
  readonly strut: Strut;
  readonly align: TextAlign;
  /** The block's padding on each side. */
  readonly padding: number;
  /** Where the block's first line starts, from the left content edge. */
  readonly firstStart: number;
  /** Where its other lines start. */
  readonly restStart: number;
}

/** How many prepared runs a cache keeps before it forgets the oldest. */
const CACHE_LIMIT = 4000;

const toEnd: RichInlineCursor = { itemIndex: 0, segmentIndex: 0, graphemeIndex: 0 };

function walk(prepared: PreparedRichInline, widths: LineWidths): RunLine[] {
  const lines: RunLine[] = [];
  let cursor: RichInlineCursor = toEnd;
  for (;;) {
    const width = Math.max(1, lines.length ? widths.rest : widths.first);
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

// The language Pretext prepares under now. Setting it clears Pretext's caches, so it is set only
// when a cache of another language prepares (DOCE-PAGINATION-9.7).
let locale: { readonly language: string | undefined } | null = null;

function prepareIn(language: string | undefined): void {
  if (locale?.language === language) return;
  setLocale(language);
  locale = { language };
}

/** A cache of prepared runs for one language, laid out in Pretext's pre-wrap white space. */
export function createLineCache(language: string | undefined): LineCache {
  const prepared = new Map<string, { run: PreparedRichInline; widths: Map<string, RunLine[]> }>();
  let hits = 0;
  let misses = 0;
  return {
    stats: () => ({ hits, misses }),
    lines(run, widths) {
      const key = JSON.stringify(run.items);
      let entry = prepared.get(key);
      if (entry) {
        hits += 1;
        prepared.delete(key);
      } else {
        misses += 1;
        prepareIn(language);
        entry = {
          run: prepareRichInline([...run.items], { whiteSpace: 'pre-wrap' }),
          widths: new Map(),
        };
      }
      prepared.set(key, entry);
      if (prepared.size > CACHE_LIMIT) prepared.delete(prepared.keys().next().value ?? key);
      const widthKey = `${String(widths.first)} ${String(widths.rest)}`;
      let lines = entry.widths.get(widthKey);
      if (!lines) {
        lines = walk(entry.run, widths);
        entry.widths.set(widthKey, lines);
      }
      return lines;
    },
  };
}

// A line's height: its strut, grown by each atom on it, which sits on the baseline at its own
// baseline, or at its bottom when it has none; an atom aligned to the line's top or bottom
// (`vertical-align: top` or `bottom`) only makes the line at least as tall as itself.
function lineHeight(run: TextRun, line: RunLine, strut: Strut): number {
  let { ascent, descent } = strut;
  let aligned = 0;
  for (let index = line.firstItem; index <= line.lastItem; index += 1) {
    const atom = run.atoms[index];
    if (!atom) continue;
    if (atom.align === 'top' || atom.align === 'bottom') {
      aligned = Math.max(aligned, atom.height);
      continue;
    }
    const baseline = atom.baseline ?? atom.height;
    ascent = Math.max(ascent, baseline);
    descent = Math.max(descent, atom.height - baseline);
  }
  return Math.max(ascent + descent, aligned);
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
  readonly start: number;
  readonly lastOfRun: boolean;
  readonly run: TextRun;
}

function runLines(
  cache: LineCache,
  input: LineLayoutInput,
  { run, first }: { readonly run: TextRun; readonly first: boolean },
): Placed[] {
  const { width, leading, firstStart, restStart } = input;
  const opening = first ? firstStart : restStart;
  const widths = { first: width - opening, rest: width - restStart };
  const lines = run.items.length ? cache.lines(run, widths) : [];
  if (!lines.length) {
    return [{ from: run.start, width: 0, height: leading, start: opening, lastOfRun: true, run }];
  }
  return lines.map((line, index) => {
    const offset = run.offsets[line.item] ?? -1;
    return {
      from: offset < 0 ? run.start : offset + line.sourceStart,
      width: line.width,
      height: lineHeight(run, line, input.strut),
      start: index === 0 ? opening : restStart,
      lastOfRun: index === lines.length - 1,
      run,
    };
  });
}

/** The line table of a block's runs. */
export function layoutLines(cache: LineCache, input: LineLayoutInput): LineTable {
  const placed = input.runs.flatMap((run, index) =>
    runLines(cache, input, { run, first: index === 0 }),
  );
  const lines: TextLine[] = [];
  let top = 0;
  placed.forEach((line, index) => {
    const next = placed[index + 1];
    const left = line.start + alignedLeft(input.align, input.width - line.start, line.width);
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
