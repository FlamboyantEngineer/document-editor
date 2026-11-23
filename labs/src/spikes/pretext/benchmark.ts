import { EditorState } from 'prosemirror-state';
import {
  LAYOUT_RULES,
  type LayoutRules,
  type MeasureInput,
} from '../../../../src/model/pagination/page-layout.js';
import type { TextMeasurement } from '../../../../src/model/pagination/text-split.js';
import {
  createProjectionView,
  type ProjectionView,
} from '../../../../src/pagination/projection-view.js';
import { type fixture, readFixture } from './fixtures.js';
import { browserLines } from './natural-lines.js';
import { blockId } from './prediction.js';
import { applySettings, contentHeight } from './settings.js';

export const afterPaint = () =>
  new Promise<number>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now())));
  });

export async function timed<Result>(run: (start: number) => Promise<Result>) {
  await afterPaint();
  const tasks: PerformanceEntry[] = [];
  const observer = PerformanceObserver.supportedEntryTypes.includes('longtask')
    ? new PerformanceObserver((list) => tasks.push(...list.getEntries()))
    : null;
  observer?.observe({ type: 'longtask' });
  const start = performance.now();
  try {
    const result = await run(start);
    const end = performance.now();
    await new Promise((resolve) => setTimeout(resolve, 25));
    if (observer) tasks.push(...observer.takeRecords());
    const observed = tasks.filter(
      (task) => task.startTime < end && task.startTime + task.duration > start,
    );
    return {
      ...result,
      longTasks: observer ? observed.length : null,
      longTaskMs: observer ? observed.reduce((sum, task) => sum + task.duration, 0) : null,
    };
  } finally {
    observer?.disconnect();
  }
}

export function mountedDom(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ALL);
  let domNodes = 0;
  while (walker.nextNode()) domNodes += 1;
  return { domNodes, elements: root.querySelectorAll('*').length };
}

// A paragraph's lines as the projection's measuring view drew them, so it splits at a drawn line's
// start, as a paragraph laid out by the layout engine does, and not after the last word that fits.
function drawnLines({ node, element }: MeasureInput): TextMeasurement {
  const { lines, leading } = browserLines(node, element, element.getBoundingClientRect());
  return {
    offset: 0,
    measure: () => {
      throw new Error('A paragraph with drawn lines splits at a line start');
    },
    lines: { lines: lines.map(({ from }) => ({ from, height: leading })) },
  };
}

// The production layout rules as the prediction lays pages out (prediction.ts): a paragraph splits
// at a line's start, and every other block moves to the next page whole, a heading kept with it.
const PREDICTED_RULES: LayoutRules = Object.fromEntries(
  Object.entries(LAYOUT_RULES).map(([type, rule]) => [
    type,
    type === 'paragraph'
      ? { ...rule, measure: drawnLines }
      : { keepsWithHeading: rule.keepsWithHeading },
  ]),
);

/**
 * The production projection of a stored document; with `predictedRules`, laid out by the rules
 * the prediction lays its pages out with, so only the measuring differs.
 */
export function baseline(root: HTMLElement, { predictedRules = false } = {}) {
  const surface = document.createElement('div');
  surface.className = 'de-document-editor pretext-baseline';
  const mount = document.createElement('div');
  mount.className = 'pretext-scroll';
  const measureIn = document.createElement('div');
  measureIn.className = 'de-document-editor__measure';
  measureIn.setAttribute('aria-hidden', 'true');
  surface.append(mount, measureIn);
  root.append(surface);
  let projection: ProjectionView | null = null;
  let laidOut = 0;
  let nextPaint: Promise<number> | undefined;

  return {
    async run(file: ReturnType<typeof fixture> | undefined, width: number, start: number) {
      nextPaint = undefined;
      applySettings(surface, width);
      if (file) {
        projection = createProjectionView({
          mount,
          measureIn,
          state: EditorState.create({ doc: readFixture(file) }),
          pageHeight: contentHeight,
          resizeColumns: false,
          ...(predictedRules ? { rules: PREDICTED_RULES } : {}),
          onLayout() {
            laidOut = performance.now();
            nextPaint ??= afterPaint();
          },
        });
      } else projection?.refresh({ remeasure: true });
      if (!projection) throw new Error('The baseline needs a document first');
      await projection.whenSettled();
      if (!nextPaint) throw new Error('The production projection settled without a layout');
      const settled = performance.now();
      const firstPaint = await nextPaint;
      const pages = [...mount.querySelectorAll<HTMLElement>('.pm-page')];
      return {
        totalPages: pages.length,
        mountedPages: pages.length,
        ...mountedDom(surface),
        indexMs: laidOut - start,
        paintMs: firstPaint - start,
        endMs: Math.max(settled, firstPaint) - start,
      };
    },
    /**
     * Each page's fragments as `[source, from, to]`: the source block's id, or its index among
     * the section's blocks, and content offsets in it. A split part after the first continues
     * the block before it.
     */
    boundaries() {
      const offsets = new Map<number, number>();
      const pages: [string, number, number][][] = [];
      let index = -1;
      projection?.projection.doc.forEach((section) =>
        section.forEach((page) => {
          const parts: [string, number, number][] = [];
          page.forEach((region) => {
            if (region.type.name !== 'page_content') return;
            region.forEach((node) => {
              if (!(Number(node.attrs.splitPartIndex) > 0)) index += 1;
              const from = offsets.get(index) ?? 0;
              const to = from + node.content.size;
              parts.push([blockId(node) ?? String(index), from, to]);
              offsets.set(index, to);
            });
          });
          pages.push(parts);
        }),
      );
      return pages;
    },
    /**
     * How full each page is drawn: the room its content has, how far down its last block ends,
     * each block's drawn height, and the line height of the page's first block.
     */
    fill() {
      return [...mount.querySelectorAll<HTMLElement>('.pm-page-content')].map((body) => {
        const top = body.getBoundingClientRect().top;
        const blocks = [...body.children] as HTMLElement[];
        const last = blocks.at(-1);
        const first = blocks[0];
        return {
          room: body.clientHeight,
          used: last ? last.getBoundingClientRect().bottom - top : 0,
          heights: blocks.map((block) => block.getBoundingClientRect().height),
          firstLine: first ? Number.parseFloat(getComputedStyle(first).lineHeight) || 0 : 0,
        };
      });
    },
    destroy() {
      projection?.destroy();
      surface.remove();
    },
  };
}
