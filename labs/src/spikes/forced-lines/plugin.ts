// The forced-lines spike: a canonical plugin that draws every top-level paragraph and heading on
// the lines Pretext computed, so the browser never chooses a line break in them. Each line after
// the first starts after a break widget; alignment is drawn from the computed widths (an indent
// widget for centred and right-aligned lines, word spacing for justified ones), so the browser's
// own alignment never moves a line either. A keystroke lays out only the blocks its steps touched.

import type { Node } from 'prosemirror-model';
import { Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { type ForcedLine, forcedLines, typographyOf } from './lines.js';

export type ForcedAlignment = 'left' | 'center' | 'right' | 'justify';

export interface ForcedLinesOptions {
  /** The width Pretext fits lines into. */
  readonly fitWidth: number;
  /** The width of the text column the lines are drawn in, which alignment fills. */
  readonly columnWidth: number;
  readonly align: ForcedAlignment;
  readonly breaks: ForcedBreak;
  /**
   * Lays out only the first this many blocks when the document opens: an experiment that shows
   * what each keystroke costs with fewer decorations to map onto the pages.
   */
  readonly limit?: number | undefined;
}

export interface ForcedLinesState {
  readonly decorations: DecorationSet;
  /** Blocks laid out by the latest transaction, and how long that took. */
  readonly laidOut: number;
  readonly milliseconds: number;
}

export const forcedLinesKey = new PluginKey<ForcedLinesState>('forcedLines');

const px = (value: number) => `${value.toFixed(3)}px`;

/**
 * How a computed line ends. `end`, the chosen mechanism: the line's last character is wrapped in
 * a span whose `::after` is a line feed, so no element of the editor's own stands between two
 * lines and the caret moves as in any text. `widget`, tried first: a `<br>` widget before each
 * line start, which ProseMirror's arrow-key handling steps around (see the spike report).
 */
export type ForcedBreak = 'end' | 'widget';

function breakWidget(): HTMLElement {
  const br = document.createElement('br');
  br.className = 'fl-break';
  return br;
}

function indentOf(line: ForcedLine, options: ForcedLinesOptions): number {
  const room = Math.max(0, options.columnWidth - line.width);
  if (options.align === 'center') return room / 2;
  if (options.align === 'right') return room;
  return 0;
}

// A line ends a run when it ends the block or comes before a hard break.
function lineDecorations(
  node: Node,
  start: number,
  line: ForcedLine,
  next: ForcedLine | undefined,
  options: ForcedLinesOptions,
): Decoration[] {
  const decorations: Decoration[] = [];
  const at = start + line.from;
  const end = start + line.to;
  // The spike aligns paragraphs; headings keep the template's alignment (their numbers are drawn
  // by the stylesheet, outside Pretext's lines).
  const aligned = node.type.name === 'paragraph';
  const indent = aligned ? indentOf(line, options) : 0;
  // Centred and right-aligned lines start after the room Pretext left them, as padding on the
  // line's first character.
  if (indent > 0 && end > at)
    decorations.push(Decoration.inline(at, at + 1, { style: `padding-left: ${px(indent)}` }));
  if (aligned && options.align === 'justify' && !line.last && line.spaces > 0) {
    const stretch = (options.columnWidth - line.width) / line.spaces;
    const trimmed = at + node.textBetween(line.from, line.to).trimEnd().length;
    if (trimmed > at && stretch > 0)
      decorations.push(Decoration.inline(at, trimmed, { style: `word-spacing: ${px(stretch)}` }));
  }
  // A hard break already ends the line before a run's first line.
  if (line.last || !next) return decorations;
  if (options.breaks === 'widget') {
    decorations.push(
      Decoration.widget(start + next.from, breakWidget, {
        side: -1,
        // The caret may stay on either side: at the end of the line before, after End, or at
        // the start of the next line, after Home. Both are the same document position.
        relaxedSide: true,
        key: 'fl-break',
        ignoreSelection: true,
      }),
    );
  } else if (end > at) {
    decorations.push(Decoration.inline(end - 1, end, { class: 'fl-end' }));
  }
  return decorations;
}

/** The decoration that marks a forced block, at `pos`. */
export function forcedBlock(node: Node, pos: number, lines: readonly ForcedLine[]): Decoration {
  return Decoration.node(pos, pos + node.nodeSize, {
    class: 'fl-forced',
    'data-fl-lines': String(lines.length),
  });
}

/** The decorations that draw a block's lines, its content starting at `start`. */
export function linesDecorations(
  node: Node,
  start: number,
  lines: readonly ForcedLine[],
  options: ForcedLinesOptions,
): Decoration[] {
  return lines.flatMap((line, index) =>
    lineDecorations(node, start, line, lines[index + 1], options),
  );
}

function blockDecorations(
  node: Node,
  pos: number,
  lines: readonly ForcedLine[],
  options: ForcedLinesOptions,
): Decoration[] {
  return [forcedBlock(node, pos, lines), ...linesDecorations(node, pos + 1, lines, options)];
}

// The top-level paragraphs and headings of each page's content, with their positions.
function eachForcedBlock(
  doc: Node,
  from: number,
  to: number,
  visit: (node: Node, pos: number) => void,
) {
  doc.nodesBetween(from, to, (node, pos, parent) => {
    if (node.isTextblock) {
      if (parent?.type.name === 'page_content' && typographyOf(node)) visit(node, pos);
      return false;
    }
    return true;
  });
}

function changedRanges(tr: Transaction): [number, number][] {
  const ranges: [number, number][] = [];
  tr.mapping.maps.forEach((map, index) => {
    const after = tr.mapping.slice(index + 1);
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      ranges.push([after.map(newStart, -1), after.map(newEnd, 1)]);
    });
  });
  return ranges;
}

function layOut(
  doc: Node,
  ranges: readonly [number, number][],
  mapped: DecorationSet,
  options: ForcedLinesOptions,
): ForcedLinesState {
  const started = performance.now();
  const remove: Decoration[] = [];
  const add: Decoration[] = [];
  const seen = new Set<number>();
  for (const [from, to] of ranges) {
    eachForcedBlock(doc, Math.max(0, from), Math.min(doc.content.size, to), (node, pos) => {
      if (seen.has(pos)) return;
      seen.add(pos);
      const style = typographyOf(node);
      if (!style || (options.limit !== undefined && seen.size > options.limit)) return;
      remove.push(...mapped.find(pos, pos + node.nodeSize));
      add.push(...blockDecorations(node, pos, forcedLines(node, style, options.fitWidth), options));
    });
  }
  return {
    decorations: mapped.remove(remove).add(doc, add),
    laidOut: seen.size,
    milliseconds: performance.now() - started,
  };
}

/** The plugin. Put it in the canonical state's plugins; the projection draws its decorations. */
export function createForcedLines(options: ForcedLinesOptions): Plugin<ForcedLinesState> {
  return new Plugin<ForcedLinesState>({
    key: forcedLinesKey,
    state: {
      init: (_config, state) =>
        layOut(state.doc, [[0, state.doc.content.size]], DecorationSet.empty, options),
      apply(tr, value, _old, state) {
        if (!tr.docChanged) return value;
        const mapped = value.decorations.map(tr.mapping, tr.doc);
        // Blocks a keystroke touched are laid out again whatever the limit.
        return layOut(state.doc, changedRanges(tr), mapped, { ...options, limit: undefined });
      },
    },
    props: {
      decorations: (state) => forcedLinesKey.getState(state)?.decorations,
    },
  });
}
