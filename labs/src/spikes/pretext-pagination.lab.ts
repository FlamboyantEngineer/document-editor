import { writeDocumentFile } from '../../../src/model/format/document-format-write.js';
import { afterPaint, baseline, mountedDom, timed } from './pretext/benchmark.js';
import { fontsReady, PredictionWorker } from './pretext/client.js';
import type { createFixtureEditors } from './pretext/editor.js';
import {
  contentBlocks,
  fixture,
  readFixture,
  requireValue,
  type Workload,
} from './pretext/fixtures.js';
import { VirtualPages } from './pretext/html.js';
import { blockId } from './pretext/prediction.js';
import { applySettings, defaultWidth } from './pretext/settings.js';
import type { FitCase } from './pretext/thresholds.js';

function mount<T extends HTMLElement>(selector: string) {
  return requireValue(document.querySelector<T>(selector), selector);
}

const root = mount('[data-pretext-lab]');
const editor = mount('#pretext-editor');
const view = mount<HTMLSelectElement>('#pretext-view');
let editors: ReturnType<typeof createFixtureEditors> | undefined;
const reader = mount('#pretext-reader');
const extent = mount('.pretext-extent');
const workload = mount<HTMLSelectElement>('#pretext-workload');
const overscan = mount<HTMLInputElement>('#pretext-overscan');
const jumpTo = mount<HTMLInputElement>('#pretext-page');
const jump = mount<HTMLButtonElement>('#pretext-jump');
const check = mount<HTMLButtonElement>('#pretext-verify');
const status = mount('#pretext-status');
const details = mount<HTMLDetailsElement>('#pretext-details');
const output = mount('#pretext-report');
const pages = new VirtualPages(reader, extent);
const widthAfterResize = defaultWidth - 120;
const overscanCount = () => Math.min(3, Math.max(0, Math.floor(overscan.valueAsNumber || 0)));
let generation = 0;
let current: PredictionWorker | undefined;
let queued = Promise.resolve();

function queue(action: () => Promise<void>) {
  queued = queued.then(action).catch((error: unknown) => {
    status.textContent = error instanceof Error ? error.message : String(error);
  });
}

function choose() {
  const selected = workload.value as Workload;
  const number = ++generation;
  check.disabled = jump.disabled = true;
  queue(async () => {
    if (number !== generation) return;
    status.textContent = 'Predicting page boundaries…';
    pages.clear();
    output.textContent = '';
    details.open = false;
    await fontsReady();
    current?.close();
    current = new PredictionWorker();
    const file = editors?.file(selected) ?? fixture(selected);
    const result = await current.request({ file, width: defaultWidth });
    if (number !== generation) return;
    document.documentElement.dataset.labReady = 'true';
    if (!result.index) {
      status.textContent = result.issues.join(' · ');
      return;
    }
    pages.show(result.index, contentBlocks(readFixture(file)), overscanCount());
    pages.jump(0);
    jumpTo.value = '1';
    jumpTo.max = String(result.index.pages.length);
    check.disabled = false;
    jump.disabled = false;
    status.textContent = `${String(result.index.pages.length)} pages indexed`;
  });
}

async function verify(
  workload: Workload = 'examples',
  width = defaultWidth,
  file = fixture(workload),
) {
  await fontsReady();
  const worker = new PredictionWorker();
  try {
    const doc = readFixture(file);
    const saved = JSON.stringify(writeDocumentFile(doc));
    const blocks = contentBlocks(doc);
    const result = await worker.request({ file, width, verify: true });
    if (!result.index || !result.measurements) throw new Error(result.issues.join(' · '));
    const oracle = await import('./pretext/oracle.js');
    const host = document.createElement('div');
    host.className = 'de-document-editor';
    applySettings(host, width);
    root.append(host);
    try {
      const comparison = oracle.verify(host, blocks, result.measurements, result.index);
      // Independently inspect every paged result, one viewport window at a time.
      const scroll = document.createElement('div');
      scroll.className = 'pretext-scroll';
      const paper = document.createElement('div');
      paper.className = 'pretext-extent';
      scroll.append(paper);
      host.append(scroll);
      const sample = new VirtualPages(scroll, paper);
      sample.show(result.index, blocks, 0);
      try {
        return {
          ...comparison,
          width: result.index.contentWidth,
          ...oracle.verifyPages(paper, result.index, blocks, result.measurements, (page) =>
            sample.jump(page),
          ),
          sourceUnchanged: JSON.stringify(writeDocumentFile(doc)) === saved,
          measurer: result.measurer,
        };
      } finally {
        sample.destroy();
      }
    } finally {
      host.remove();
    }
  } finally {
    worker.close();
  }
}

async function compare(
  workload: 'short' | 'medium' | 'long' | 'stress-text' | 'stress-distinct',
  experimentFirst = false,
) {
  await fontsReady();
  const file = fixture(workload);
  async function experiment() {
    let worker: PredictionWorker | undefined;
    let blocks: ReturnType<typeof contentBlocks> = [];
    try {
      async function run(width: number, cold: boolean) {
        return timed(async (start) => {
          if (cold) {
            worker = new PredictionWorker();
            pages.clear();
            reader.scrollTop = 0;
          }
          const pending = requireValue(worker, 'prediction worker').request({
            width,
            ...(cold ? { file } : {}),
          });
          if (cold) blocks = contentBlocks(readFixture(file));
          const result = await pending;
          const indexMs = performance.now() - start;
          if (!result.index) throw new Error(result.issues.join(' · '));
          pages.show(result.index, blocks, 1);
          const paintMs = (await afterPaint()) - start;
          return {
            totalPages: result.index.pages.length,
            mountedPages: extent.childElementCount,
            ...mountedDom(reader),
            indexMs,
            paintMs,
            endMs: paintMs,
            prepareMs: result.prepareMs,
            packMs: result.packMs,
            hits: result.hits,
            misses: result.misses,
          };
        });
      }
      return { cold: await run(defaultWidth, true), warm: await run(widthAfterResize, false) };
    } finally {
      worker?.close();
      pages.clear();
    }
  }
  async function existing() {
    const flow = baseline(root);
    try {
      const cold = await timed((start) => flow.run(file, defaultWidth, start));
      const warm = await timed((start) => flow.run(undefined, widthAfterResize, start));
      return { cold, warm };
    } finally {
      flow.destroy();
    }
  }
  if (experimentFirst) {
    const predicted = await experiment();
    return { predicted, baseline: await existing() };
  }
  const reference = await existing();
  return { predicted: await experiment(), baseline: reference };
}

async function compareProductionBoundaries(
  workload: 'short' | 'long' = 'short',
  width = defaultWidth,
) {
  await fontsReady();
  const file = fixture(workload);
  const reference = baseline(root);
  const worker = new PredictionWorker();
  try {
    const nodes = contentBlocks(readFixture(file));
    const result = await worker.request({ file, width });
    await reference.run(file, width, performance.now());
    const html = reference.boundaries();
    const predicted = result.index?.pages.map((page) =>
      page.map(({ block, from, to }) => [
        blockId(requireValue(nodes[block], 'fragment source block')),
        from,
        to,
      ]),
    );
    return { html, predicted };
  } finally {
    reference.destroy();
    worker.close();
  }
}

const query = new URLSearchParams(location.search);
function showView() {
  const editing = view.value === 'editor';
  root.hidden = editing;
  document.documentElement.dataset.labReady = 'false';
  if (!editing) {
    editors?.close();
    choose();
    return;
  }
  const number = ++generation;
  pages.clear();
  const selected = workload.value as Workload;
  queue(async () => {
    const { createFixtureEditors } = await import('./pretext/editor.js');
    if (number !== generation) return;
    current?.close();
    current = undefined;
    editors ??= createFixtureEditors(editor);
    editors.show(selected, () => {
      if (number === generation) document.documentElement.dataset.labReady = 'true';
    });
  });
}

if (!query.has('measure')) {
  if (query.get('view') === 'preview') view.value = 'preview';
  workload.addEventListener('change', showView);
  view.addEventListener('change', showView);
  overscan.addEventListener('change', () => pages.setOverscan(overscanCount()));
  jump.addEventListener('click', () => pages.jump((jumpTo.valueAsNumber || 1) - 1));
  check.addEventListener('click', () => {
    const selected = workload.value as Workload;
    const number = generation;
    check.disabled = true;
    details.open = true;
    output.textContent = 'Comparing with naturally wrapped HTML…';
    queue(async () => {
      try {
        const { predictedBoundaries, htmlBoundaries, ...result } = await verify(
          selected,
          defaultWidth,
          editors?.file(selected),
        );
        if (number !== generation) return;
        output.textContent = JSON.stringify(
          {
            ...result,
            mismatchedPages: result.boundaryMismatches.map((page) => ({
              page,
              predicted: predictedBoundaries[page - 1],
              html: htmlBoundaries[page - 1],
            })),
          },
          null,
          2,
        );
      } finally {
        if (number === generation) check.disabled = false;
      }
    });
  });
  const refreshPreview = () => {
    if (view.value === 'preview') choose();
  };
  document.fonts.addEventListener('loadingdone', refreshPreview);
  document.fonts.addEventListener('loadingerror', refreshPreview);
  showView();
}

declare global {
  interface Window {
    pretextPagination: {
      compare: typeof compare;
      verify: typeof verify;
      compareProductionBoundaries: typeof compareProductionBoundaries;
      lineFitThresholds: typeof lineFitThresholds;
    };
  }
}
async function lineFitThresholds(cases: readonly FitCase[]) {
  await fontsReady();
  const host = document.createElement('div');
  host.className = 'de-document-editor';
  root.append(host);
  try {
    const thresholds = await import('./pretext/thresholds.js');
    return await thresholds.lineFitThresholds(host, cases);
  } finally {
    host.remove();
  }
}

window.pretextPagination = { compare, verify, compareProductionBoundaries, lineFitThresholds };
