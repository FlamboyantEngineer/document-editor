// Laying a block's runs out on lines with Pretext, and the line table they make. Each prepared run
// is kept with its block's node for as long as the node lives, so a keystroke prepares only the run
// it changed and laying the whole document out again prepares nothing, however long it is; its
// lines are kept by width, so the same text at two widths lays out once at each.

import { setLocale } from '@chenglou/pretext';
import {
  layoutNextRichInlineLineRange,
  materializeRichInlineLineRange,
  type PreparedRichInline,
  prepareRichInline,
  type RichInlineCursor,
} from '@chenglou/pretext/rich-inline';
import type { LineTable, TextLine } from './line-table.js';
import { type Strut, textWidth } from './metrics.js';
import type { TextRun } from './runs.js';
import type { TextAlign } from './typography.js';

/** The white space one item ends a line with. */
interface Trailing {
  readonly item: number;
  readonly width: number;
}

/** A run's line as Pretext broke it: where it starts in the run's items and how wide it is. */
interface RunLine {
  readonly item: number;
  readonly sourceStart: number;
  readonly width: number;
  /** The items the line holds, first to last. */
  readonly firstItem: number;
  readonly lastItem: number;
  /**
   * The white space the run's last line ends with, which Pretext counts in it: each item's, last
   * first, back to the first that holds more than white space.
   */
  readonly trailing: readonly Trailing[];
}

/** Prepared runs and their lines, kept between layouts. */
export interface LineCache {
  /** Lays a run of a block out at its first line's width and the other lines' width. */
  readonly lines: (run: TextRun, widths: LineWidths, block: object) => readonly RunLine[];
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
  /** The block the runs are of, which keeps them prepared while it lives. */
  readonly block: object;
  /** A caption's label: its item in the first run, and its text. */
  readonly label?: { readonly item: number; readonly text: string } | undefined;
}

/**
 * How many prepared runs a cache keeps by their items alone, for text a new node repeats (a
 * document read again, a run another block has too), before it forgets the oldest. The runs of the
 * document's own blocks are kept by node, without a limit.
 */
const RECENT_LIMIT = 4000;

// The language Pretext was last told, module-wide as Pretext's is. Telling it clears every width
// it measured, so it is told only when the language changes.
let toldLocale: { readonly language: string | undefined } | null = null;

/** Selects the text's language before preparing or measuring it. */
export function selectTextLanguage(language: string | undefined): void {
  if (toldLocale?.language === language) return;
  setLocale(language);
  toldLocale = { language };
}

const toEnd: RichInlineCursor = { itemIndex: 0, segmentIndex: 0, graphemeIndex: 0 };

// The spaces and tabs a line's text ends with, each fragment's in its item's font, back over every
// fragment that is white space only: spaces that end a block hang whichever element holds them.
function trailingOf(
  items: TextRun['items'],
  fragments: readonly { itemIndex: number; text: string }[],
): Trailing[] {
  const trailing: Trailing[] = [];
  for (let index = fragments.length - 1; index >= 0; index -= 1) {
    const fragment = fragments[index];
    const item = fragment ? items[fragment.itemIndex] : undefined;
    if (!fragment || !item || !('font' in item)) break;
    const spaces = /[ \t]+$/u.exec(fragment.text)?.[0] ?? '';
    trailing.push({ item: fragment.itemIndex, width: spaces ? textWidth(spaces, item.font) : 0 });
    if (spaces.length < fragment.text.length) break;
  }
  return trailing;
}

function walk(
  prepared: PreparedRichInline,
  widths: LineWidths,
  items: TextRun['items'],
): RunLine[] {
  const lines: RunLine[] = [];
  let cursor: RichInlineCursor = toEnd;
  let lastFragments: readonly { itemIndex: number; text: string }[] = [];
  for (;;) {
    const width = Math.max(1, lines.length ? widths.rest : widths.first);
    const range = layoutNextRichInlineLineRange(prepared, width, cursor);
    if (!range) break;
    const { fragments } = materializeRichInlineLineRange(prepared, range);
    const first = fragments[0];
    const last = fragments.at(-1);
    lastFragments = fragments;
    lines.push({
      item: first?.itemIndex ?? 0,
      sourceStart: first?.sourceStart ?? 0,
      width: range.width,
      firstItem: first?.itemIndex ?? 0,
      lastItem: last?.itemIndex ?? 0,
      trailing: [],
    });
    cursor = range.end;
  }
  // A wrapped line leaves its hanging spaces out already; the run's last line counts them.
  const end = lines.at(-1);
  if (end) lines[lines.length - 1] = { ...end, trailing: trailingOf(items, lastFragments) };
  return lines;
}

interface Prepared {
  readonly run: PreparedRichInline;
  readonly widths: Map<string, RunLine[]>;
}

/** A cache of prepared runs for one language, laid out in Pretext's pre-wrap white space. */
export function createLineCache(language: string | undefined): LineCache {
  const byBlock = new WeakMap<object, Map<string, Prepared>>();
  const recent = new Map<string, Prepared>();
  let hits = 0;
  let misses = 0;
  const remember = (key: string, entry: Prepared) => {
    recent.delete(key);
    recent.set(key, entry);
    if (recent.size > RECENT_LIMIT) recent.delete(recent.keys().next().value ?? key);
  };
  return {
    stats: () => ({ hits, misses }),
    lines(run, widths, block) {
      selectTextLanguage(language);
      const key = JSON.stringify(run.items);
      let own = byBlock.get(block);
      if (!own) {
        own = new Map();
        byBlock.set(block, own);
      }
      let entry = own.get(key) ?? recent.get(key);
      if (entry) {
        hits += 1;
      } else {
        misses += 1;
        entry = {
          run: prepareRichInline([...run.items], { whiteSpace: 'pre-wrap' }),
          widths: new Map(),
        };
      }
      own.set(key, entry);
      remember(key, entry);
      const widthKey = `${String(widths.first)} ${String(widths.rest)}`;
      let lines = entry.widths.get(widthKey);
      if (!lines) {
        lines = walk(entry.run, widths, run.items);
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
  readonly side: number | undefined;
  /** Whether the line starts inside a word inserted at `from` (`TextLine.inWord`). */
  readonly inWord: boolean;
  readonly width: number;
  readonly height: number;
  readonly start: number;
  readonly lastOfRun: boolean;
  readonly run: TextRun;
  /** Where in the label a line after the first starts, for one that starts inside it. */
  readonly labelStart?: number | undefined;
}

function runLines(
  cache: LineCache,
  input: LineLayoutInput,
  { run, first }: { readonly run: TextRun; readonly first: boolean },
): Placed[] {
  const { width, leading, firstStart, restStart } = input;
  const opening = first ? firstStart : restStart;
  const widths = { first: width - opening, rest: width - restStart };
  const lines = run.items.length ? cache.lines(run, widths, input.block) : [];
  if (!lines.length) {
    const empty = { from: run.start, side: undefined, inWord: false, width: 0, height: leading };
    return [{ ...empty, start: opening, lastOfRun: true, run }];
  }
  return lines.map((line, index) => {
    const inLabel = first && index > 0 && line.item === input.label?.item;
    const { from, side, inWord } = lineStart(run, line, index);
    return {
      ...(inLabel ? { labelStart: line.sourceStart } : {}),
      from,
      side,
      inWord,
      width: shownWidth(run, line),
      height: lineHeight(run, line, input.strut),
      start: index === 0 ? opening : restStart,
      lastOfRun: index === lines.length - 1,
      run,
    };
  });
}

// A line's width: the spaces that end the block hang, as Chromium hangs them in pre-wrap; before
// a hard break they hang only where they do not fit, so they count. Only a run's last line has any.
// Content text alone ends the block: after a label or an inserted word the editor draws a trailing
// break, before which the spaces count.
function shownWidth(run: TextRun, line: RunLine): number {
  if (run.endsWithBreak) return line.width;
  let hanging = 0;
  for (const { item, width } of line.trailing) {
    if ((run.offsets[item] ?? -1) < 0 || (run.sides[item] ?? null) !== null) break;
    hanging += width;
  }
  return Math.max(0, line.width - hanging);
}

// Where a run's line starts: its content offset, and its side among the elements there.
function lineStart(run: TextRun, line: RunLine, index: number) {
  const offset = run.offsets[line.item] ?? -1;
  // A line that starts among a variable's words starts before its first word's element.
  const word = index > 0 && line.sourceStart > 0 ? valueWordAt(run, line) : undefined;
  // A line that starts inside an inserted word starts at the word's offset, in no content.
  const inserted = (run.sides[line.item] ?? null) !== null;
  const inWord = word === undefined && index > 0 && line.sourceStart > 0 && inserted;
  // A run's first line starts at the run, before any hidden content its first item follows.
  const at = inWord || word !== undefined ? 0 : line.sourceStart;
  return {
    from: offset < 0 || index === 0 ? run.start : offset + at,
    side: word ?? (inWord ? undefined : insertedSide(run, line)),
    inWord,
  };
}

// The side a line that starts at a word of a variable's value inside its item breaks before, as
// its first word's element; undefined for any other line, as one inside a word.
function valueWordAt(run: TextRun, line: RunLine): number | undefined {
  const word = run.words?.[line.item]?.find((each) => each.start === line.sourceStart);
  return word === undefined ? undefined : word.side - 1;
}

// Where a line that starts among inserted text breaks from the line before: before its first
// inserted word, or after the last word inserted where its content starts.
function insertedSide(run: TextRun, line: RunLine): number | undefined {
  const own = run.sides[line.item];
  if (own !== null && own !== undefined) return own - 1;
  const before = run.sides[line.item - 1];
  const sameOffset = run.offsets[line.item - 1] === run.offsets[line.item];
  return before !== null && before !== undefined && sameOffset && line.sourceStart === 0
    ? before + 1
    : undefined;
}

// A caption's label as its lines draw it (`LineTable.label`), when a line starts inside it or the
// content starts on a line after it; null when the content starts on the label's line.
function drawnLabel(input: LineLayoutInput, placed: readonly Placed[]): string | null {
  if (!input.label) return null;
  const starts = placed.flatMap((line) => (line.labelStart === undefined ? [] : [line.labelStart]));
  // The line after the label's last starts at the content, so the label ends its line: at its
  // first item, after any content hidden before it.
  const run = input.runs[0];
  const content = run?.offsets.find((offset, index) => offset >= 0 && run.sides[index] === null);
  const ends = placed[starts.length + 1]?.from === (content ?? run?.start);
  if (!starts.length && !ends) return null;
  const { text } = input.label;
  const edges = [0, ...starts, text.length];
  const parts = edges.slice(1).map((end, index) => text.slice(edges[index] ?? 0, end));
  return parts.join('\n') + (ends ? '\n' : '');
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
      ...(line.side === undefined ? {} : { side: line.side }),
      ...(line.inWord ? { inWord: true } : {}),
    });
    top += line.height;
  });
  const label = drawnLabel(input, placed);
  return {
    width: input.width + 2 * input.padding,
    lines,
    height: top,
    overhead: 2 * input.padding,
    ...(label === null ? {} : { label }),
  };
}
