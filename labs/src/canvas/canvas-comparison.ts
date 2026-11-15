import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { createDocumentSchema, type TextMeasurement } from '../../../src/model/index.js';
import { planParagraphSplit } from '../../../src/model/pagination/text-split.js';
import { measureCanvasText } from '../../../src/pagination/canvas-text-measure.js';

interface SplitRun {
  readonly milliseconds: number;
  readonly breaks: readonly number[];
  readonly usedCanvas: boolean;
}

export interface CanvasComparison {
  readonly domMs: number;
  readonly canvasMs: number;
  readonly usedCanvas: boolean;
  readonly matches: boolean;
  readonly pages: number;
  readonly characters: number;
}

function domMeasurement(element: HTMLElement): TextMeasurement {
  const text = element.firstChild;
  if (!text) throw new Error('The comparison paragraph is empty.');
  return {
    offset: 0,
    measure(from, to) {
      const range = element.ownerDocument.createRange();
      range.setStart(text, from);
      range.setEnd(text, to);
      const tops = new Set<number>();
      for (const rect of range.getClientRects()) {
        if (rect.width > 0.5 && rect.height > 0.5) tops.add(Math.round(rect.top));
      }
      return { height: range.getBoundingClientRect().height, lines: tops.size };
    },
  };
}

function splitParagraph(
  element: HTMLElement,
  node: ProseMirrorNode,
  options: { readonly canvas: boolean; readonly height: number },
): SplitRun {
  const started = performance.now();
  const fast = options.canvas ? measureCanvasText(element, node) : null;
  const measurement = fast ?? domMeasurement(element);
  const breaks: number[] = [];
  let offset = 0;
  let remaining = options.height;
  while (remaining > 800) {
    const split = planParagraphSplit({
      text: node.textContent.slice(offset),
      height: remaining,
      fitting: 800,
      measurement: { ...measurement, offset },
    });
    if (!split) break;
    offset += split.next;
    remaining = split.tailHeight;
    breaks.push(offset);
  }
  return { milliseconds: performance.now() - started, breaks, usedCanvas: fast !== null };
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const median = (runs: readonly SplitRun[]) =>
  [...runs].map((run) => run.milliseconds).sort((a, b) => a - b)[Math.floor(runs.length / 2)] ?? 0;

/** Compares actual split planning, including metric setup but excluding initial HTML layout. */
export async function compareCanvasText(
  owner: Document,
  repetitions: number,
): Promise<CanvasComparison> {
  const element = owner.createElement('p');
  element.className = 'lab-canvas-measure';
  element.textContent = 'A paragraph with ordinary words and punctuation fills several pages. '
    .repeat(repetitions)
    .trim();
  const schema = createDocumentSchema();
  const node = schema.node('paragraph', null, schema.text(element.textContent));
  owner.body.append(element);
  try {
    await owner.fonts.ready;
    await nextFrame();
    const style = owner.defaultView?.getComputedStyle(element);
    if (
      style?.width !== '500px' ||
      style.fontSize !== '16px' ||
      style.lineHeight !== '24px' ||
      style.whiteSpace !== 'pre-wrap'
    )
      throw new Error('Use the Reference stylesheet for this comparison.');
    const height = element.getBoundingClientRect().height;
    const run = (canvas: boolean) => splitParagraph(element, node, { canvas, height });
    run(false);
    run(true);
    const dom: SplitRun[] = [];
    const canvas: SplitRun[] = [];
    for (let trial = 0; trial < 5; trial += 1) {
      await nextFrame();
      if (trial % 2) {
        canvas.push(run(true));
        dom.push(run(false));
      } else {
        dom.push(run(false));
        canvas.push(run(true));
      }
    }
    return {
      domMs: median(dom),
      canvasMs: median(canvas),
      usedCanvas: canvas.every((run) => run.usedCanvas),
      matches: dom.every(
        (run, index) => JSON.stringify(run.breaks) === JSON.stringify(canvas[index]?.breaks),
      ),
      pages: (dom[0]?.breaks.length ?? 0) + 1,
      characters: node.textContent.length,
    };
  } finally {
    element.remove();
  }
}
