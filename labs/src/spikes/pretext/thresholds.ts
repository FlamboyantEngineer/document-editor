// Line-fit thresholds: the narrowest column at which a chosen character still sits on a
// paragraph's first line, found once in the browser and once in the prediction worker.
import type { DocumentFile } from '../../../../src/model/index.js';
import { PredictionWorker } from './client.js';
import { contentBlocks, readFixture, requireValue } from './fixtures.js';
import { pageContent, renderBlock } from './html.js';
import { applySettings, defaultWidth } from './settings.js';

export interface FitCase {
  /** A stored file holding one paragraph. */
  readonly file: DocumentFile;
  /** The paragraph offset of the character that must stay on the first line. */
  readonly at: number;
}

export interface FitThreshold {
  readonly browser: number;
  readonly pretext: number;
}

// Below Chromium's layout unit at a device pixel ratio of 2 (1/128 CSS px).
const step = 1 / 512;
const narrowest = 40;

async function search(fits: (width: number) => Promise<boolean> | boolean) {
  let low = Math.round(narrowest / step);
  let high = Math.round(defaultWidth / step);
  if (!(await fits(high * step))) throw new Error('The case does not fit on one line');
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (await fits(middle * step)) high = middle;
    else low = middle;
  }
  return high * step;
}

function firstLineHolds(element: HTMLElement, at: number) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let offset = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    if (at < offset + text.length) {
      const range = document.createRange();
      range.setStart(text, at - offset);
      range.setEnd(text, at - offset + 1);
      const glyph = requireValue(range.getClientRects()[0], 'character box');
      const top = element.getBoundingClientRect().top;
      const leading = Number.parseFloat(getComputedStyle(element).lineHeight);
      return glyph.top + glyph.height / 2 - top < leading;
    }
    offset += text.length;
  }
  throw new Error(`No character at ${String(at)}`);
}

export async function lineFitThresholds(
  host: HTMLElement,
  cases: readonly FitCase[],
): Promise<FitThreshold[]> {
  const results: FitThreshold[] = [];
  applySettings(host, defaultWidth);
  const column = pageContent();
  column.classList.add('pretext-oracle');
  host.append(column);
  try {
    for (const { file, at } of cases) {
      const node = requireValue(contentBlocks(readFixture(file))[0], 'case paragraph');
      const element = renderBlock(node);
      column.replaceChildren(element);
      const browser = await search((width) => {
        column.style.width = `${String(width)}px`;
        return firstLineHolds(element, at);
      });
      const worker = new PredictionWorker();
      try {
        let first = true;
        const pretext = await search(async (width) => {
          const result = await worker.request({ width, verify: true, ...(first && { file }) });
          first = false;
          const lines = requireValue(result.measurements?.[0]?.lines, 'predicted lines');
          return (lines[1]?.from ?? Number.POSITIVE_INFINITY) > at;
        });
        results.push({ browser, pretext });
      } finally {
        worker.close();
      }
    }
  } finally {
    column.remove();
  }
  return results;
}
