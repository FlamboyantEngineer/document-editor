// The forced-lines guard, as the lab's probe (`window.forcedLines`): reads every forced block the
// pages draw and counts the lines the browser drew in it against the breaks the plugin placed. A
// line the browser wrapped by itself, or a break that drew no line, is a mismatch.

export interface ForcedLinesReport {
  readonly blocks: number;
  readonly lines: number;
  readonly mismatches: readonly {
    readonly text: string;
    readonly drawn: number;
    readonly expected: number;
  }[];
  /** The furthest any drawn line reaches past its block's right edge, in pixels. */
  readonly overhang: number;
}

declare global {
  interface Window {
    forcedLines: { check: () => ForcedLinesReport };
  }
}

// The distinct line boxes the text of `element` is drawn on.
function drawnLines(element: Element): { count: number; right: number } {
  const range = document.createRange();
  range.selectNodeContents(element);
  const tops: number[] = [];
  let right = -Infinity;
  for (const rect of range.getClientRects()) {
    if (rect.height === 0) continue;
    right = Math.max(right, rect.right);
    if (!tops.some((top) => Math.abs(top - rect.top) < rect.height / 2)) tops.push(rect.top);
  }
  return { count: Math.max(1, tops.length), right };
}

function check(): ForcedLinesReport {
  const mismatches: ForcedLinesReport['mismatches'][number][] = [];
  let lines = 0;
  let overhang = 0;
  const blocks = document.querySelectorAll('.de-document-editor__content .fl-forced');
  for (const block of blocks) {
    // Line ends drawn by a hard break or by the plugin, except one that ends the block's part on
    // this page, after which no line follows.
    const ends = [...block.querySelectorAll('br:not(.ProseMirror-trailingBreak), .fl-end')];
    const breaks = ends.filter((end) => {
      const rest = document.createRange();
      rest.setStartAfter(end);
      rest.setEnd(block, block.childNodes.length);
      return end.nodeName === 'BR' || rest.toString().length > 0;
    }).length;
    const expected = breaks + 1;
    const { count, right } = drawnLines(block);
    lines += count;
    const edge = block.getBoundingClientRect().right;
    overhang = Math.max(overhang, right - edge);
    if (count !== expected)
      mismatches.push({ text: (block.textContent ?? '').slice(0, 60), drawn: count, expected });
  }
  return { blocks: blocks.length, lines, mismatches, overhang };
}

export function installForcedLinesProbe(): void {
  window.forcedLines = { check };
}
