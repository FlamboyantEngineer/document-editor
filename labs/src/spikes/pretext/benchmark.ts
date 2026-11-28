import { EditorState } from 'prosemirror-state';
import { LAYOUT_RULES, type LayoutRules } from '../../../../src/model/pagination/page-layout.js';
import {
  createProjectionView,
  type ProjectionView,
} from '../../../../src/pagination/projection-view.js';
import { labTextLayout, templateOfWidth } from '../../lab-pages.js';
import { type fixture, readFixture } from './fixtures.js';
import { applySettings, contentHeight, displayMath, inlineMath, template } from './settings.js';

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

// Math at the boxes the spike's stylesheet draws it in (pretext-pagination.css), as the prediction
// sizes it: inline math with its bottom 3px below the baseline, display math its height alone.
const MATH_RULES: LayoutRules = {
  math_inline: {
    size: () => ({ ...inlineMath, baseline: inlineMath.height - 3 }),
  },
  math_display: { ...LAYOUT_RULES.math_display, size: () => ({ height: displayMath.height }) },
};

/** The production projection of a stored document, laid out by the layout engine. */
export function baseline(root: HTMLElement) {
  const surface = document.createElement('div');
  surface.className = 'de-document-editor pretext-baseline';
  const mount = document.createElement('div');
  mount.className = 'pretext-scroll';
  surface.append(mount);
  root.append(surface);
  let projection: ProjectionView | null = null;
  let laidOut = 0;
  let laidOutIn = template;
  let nextPaint: Promise<number> | undefined;

  return {
    async run(file: ReturnType<typeof fixture> | undefined, width: number, start: number) {
      nextPaint = undefined;
      applySettings(surface, width);
      laidOutIn = templateOfWidth(template, width);
      if (file) {
        projection = createProjectionView({
          mount,
          state: EditorState.create({ doc: readFixture(file) }),
          pageHeight: contentHeight,
          resizeColumns: false,
          textLayout: labTextLayout(() => laidOutIn, {
            layoutRules: () => ({ ...LAYOUT_RULES, ...MATH_RULES }),
          }),
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
    destroy() {
      projection?.destroy();
      surface.remove();
    },
  };
}
