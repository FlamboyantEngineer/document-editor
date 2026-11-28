import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { TextMeasurement } from '../model/pagination/text-split.js';
import { countPrefix } from '../utils/count-prefix.js';
import { hasCodeCaretLine } from './blocks/linked-code.js';
import type { LineTable, TextLine } from './line-table.js';

// A point touches empty lines anchored there as well as the line that contains it.
const pointEnd = (line: TextLine) => Math.max(line.to, line.from + 1);

function measureRange(lines: readonly TextLine[], from: number, to: number) {
  const point = from === to;
  const first = countPrefix(lines.length, (index) => {
    const line = lines[index];
    const edge = line ? (point ? pointEnd(line) : line.to) : Number.POSITIVE_INFINITY;
    return !(edge > from);
  });
  const end = countPrefix(lines.length, (index) => {
    const start = lines[index]?.from ?? Number.POSITIVE_INFINITY;
    return point ? start <= from : start < to;
  });
  return span(lines[first], lines[end - 1], end - first);
}

function span(first: TextLine | undefined, last: TextLine | undefined, count: number) {
  return count > 0 && first && last
    ? { height: last.top + last.height - first.top, lines: count }
    : { height: 0, lines: 0 };
}

// Engine lines tile their offsets. Keep accepting caller-supplied tables in any order.
function ordered(lines: readonly TextLine[]): boolean {
  return lines.every((line, index) => {
    const before = lines[index - 1];
    return !before || (before.from <= line.from && before.to <= line.to);
  });
}

/** A line table as a text measurement, keeping all offsets relative to the whole block. */
export function lineTableMeasurement(
  table: LineTable,
  offset = 0,
  node?: ProseMirrorNode,
): TextMeasurement {
  const code = node && hasCodeCaretLine(node) ? node.textContent : '';
  let canSearch: boolean | undefined;
  return {
    offset,
    overhead: table.overhead,
    lines: table,
    measure(from, to) {
      const { lines } = table;
      // A retained newline ends the fragment with a caret line starting at its exclusive end.
      const end = to > from && code.charAt(to - 1) === '\n' ? to + 1 : to;
      if ((canSearch ??= ordered(lines))) return measureRange(lines, from, end);
      const touched = lines.filter((line) =>
        from === end
          ? line.from <= from && from < pointEnd(line)
          : line.from < end && line.to > from,
      );
      return span(touched[0], touched.at(-1), touched.length);
    },
  };
}
