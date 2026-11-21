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
  /** The furthest any drawn character reaches past the column's right edge, in pixels. */
  readonly overhang: number;
}

// The room past the column the lab's stylesheet gives forced blocks (`margin-inline-end`).
const SLACK = 8;

declare global {
  interface Window {
    forcedLines: { check: () => ForcedLinesReport };
  }
}

// The distinct line boxes the text of `element` is drawn on, and how far its furthest drawn
// character other than a space reaches.
function drawnLines(element: Element): { count: number; right: number } {
  const range = document.createRange();
  range.selectNodeContents(element);
  const tops: number[] = [];
  for (const rect of range.getClientRects()) {
    if (rect.height === 0) continue;
    if (!tops.some((top) => Math.abs(top - rect.top) < rect.height / 2)) tops.push(rect.top);
  }
  let right = -Infinity;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue ?? '';
    for (let at = 0; at < text.length; at += 1) {
      if (text[at] === ' ') continue;
      range.setStart(node, at);
      range.setEnd(node, at + 1);
      right = Math.max(right, range.getBoundingClientRect().right);
    }
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
    // The column ends where the block's box would without the lab's slack.
    const edge = block.getBoundingClientRect().right - SLACK;
    overhang = Math.max(overhang, right - edge);
    if (count !== expected)
      mismatches.push({ text: (block.textContent ?? '').slice(0, 60), drawn: count, expected });
  }
  return { blocks: blocks.length, lines, mismatches, overhang };
}

export function installForcedLinesProbe(): void {
  window.forcedLines = { check };
}
