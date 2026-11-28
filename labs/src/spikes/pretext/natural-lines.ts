// Reading the lines the browser drew a text block on, for verification only: the oracle reads
// natural HTML with it, and the production comparison the pages the projection draws.
import type { Node } from 'prosemirror-model';
import type { Line } from './prediction.js';

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
const inlineMathSelector = '[data-inline-type="latex"]';

/**
 * The lines the browser drew a text block's content on, each by the content offset it starts at,
 * and their height: from where each grapheme, inline math box and hard break sits.
 */
export function browserLines(node: Node, element: HTMLElement, rect: DOMRect) {
  const css = getComputedStyle(element);
  const leading = Number.parseFloat(css.lineHeight);
  const padTop = Number.parseFloat(css.paddingTop);
  const padBottom = Number.parseFloat(css.paddingBottom);
  const count = Math.max(1, Math.round((rect.height - padTop - padBottom) / leading));
  const starts = Array<number | undefined>(count);
  const explicit = new Map<number, number>([[0, 0]]);
  const range = document.createRange();
  const boxSizes: number[] = [];
  node.forEach((child) => {
    if (child.type.name === 'math_inline') boxSizes.push(child.nodeSize);
  });
  let boxIndex = 0;
  let offset = 0;
  const preserve = css.whiteSpace === 'pre-wrap';
  const lineOf = (glyph: DOMRect) =>
    Math.max(0, Math.round((glyph.top + glyph.height / 2 - rect.top - padTop) / leading - 0.5));
  const mark = (line: number, at: number) => {
    if (line < count && starts[line] === undefined) starts[line] = at;
  };

  function scan(parent: globalThis.Node) {
    for (const child of parent.childNodes) {
      if (child instanceof Text) {
        for (const { segment, index } of segmenter.segment(child.data)) {
          if (!preserve && /^[\t\n\r\f ]+$/u.test(segment)) continue;
          range.setStart(child, index);
          range.setEnd(child, index + segment.length);
          const glyph = range.getClientRects()[0];
          if (!glyph) continue;
          const line = lineOf(glyph);
          if (preserve && segment.includes('\n'))
            explicit.set(line + 1, offset + index + segment.length);
          else if (glyph.width > 0) mark(line, offset + index);
        }
        offset += child.length;
      } else if (child instanceof HTMLElement) {
        if (child.matches(inlineMathSelector)) {
          mark(lineOf(child.getBoundingClientRect()), offset);
          offset += boxSizes[boxIndex++] ?? 1;
        } else if (child.tagName === 'BR') {
          explicit.set(lineOf(child.getBoundingClientRect()) + 1, offset + 1);
          offset += 1;
        } else scan(child);
      }
    }
  }

  scan(element);
  const lines: Line[] = Array.from(starts, (start, index) => ({
    from: start ?? explicit.get(index) ?? offset,
    width: 0,
  }));
  return { lines, leading: (rect.height - padTop - padBottom) / count };
}
