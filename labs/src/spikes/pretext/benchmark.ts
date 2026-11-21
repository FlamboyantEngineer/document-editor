import { EditorState } from 'prosemirror-state';
import {
  createProjectionView,
  type ProjectionView,
} from '../../../../src/pagination/projection-view.js';
import { type fixture, readFixture } from './fixtures.js';
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

export function baseline(root: HTMLElement) {
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
    boundaries() {
      const offsets = new Map<string, number>();
      const pages: [string, number, number][][] = [];
      projection?.projection.doc.forEach((section) =>
        section.forEach((page) => {
          const parts: [string, number, number][] = [];
          page.forEach((region) => {
            if (region.type.name !== 'page_content') return;
            region.forEach((node) => {
              const id = blockId(node);
              if (!id)
                throw new Error('Production boundary comparison requires identified source blocks');
              const from = offsets.get(id) ?? 0;
              const to = from + node.content.size;
              parts.push([id, from, to]);
              offsets.set(id, to);
            });
          });
          pages.push(parts);
        }),
      );
      return pages;
    },
    destroy() {
      projection?.destroy();
      surface.remove();
    },
  };
}
