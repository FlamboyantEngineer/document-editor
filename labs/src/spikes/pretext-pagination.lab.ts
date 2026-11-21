import { writeDocumentFile } from '../../../src/model/format/document-format-write.js';
import { afterPaint, baseline, mountedDom, timed } from './pretext/benchmark.js';
import {
  contentBlocks,
  fixture,
  readFixture,
  requireValue,
  type Workload,
} from './pretext/fixtures.js';
import { VirtualPages } from './pretext/html.js';
import { blockId } from './pretext/prediction.js';
import type { LayoutRequest, LayoutResult } from './pretext/protocol.js';
import {
  applySettings,
  code,
  defaultWidth,
  font,
  headings,
  paragraph,
} from './pretext/settings.js';

function mount<T extends HTMLElement>(selector: string) {
  return requireValue(document.querySelector<T>(selector), selector);
}

const root = mount('#lab-root');
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
const fonts = [
  paragraph,
  ...headings,
  code,
  { ...paragraph, weight: 700 },
  { ...paragraph, italic: true },
  { ...paragraph, italic: true, weight: 700 },
  { ...paragraph, family: '"Courier New", monospace' },
];
const fontsReady = async () => {
  await Promise.all(fonts.map((style) => document.fonts.load(font(style))));
  await document.fonts.ready;
};

class PredictionWorker {
  private readonly worker = new Worker(new URL('./pretext-pagination-worker.js', import.meta.url), {
    type: 'module',
  });

  request(request: LayoutRequest) {
    return new Promise<LayoutResult>((resolve, reject) => {
      const signal = new AbortController();
      this.worker.addEventListener(
        'message',
        (event: MessageEvent<LayoutResult | { error: string }>) => {
          signal.abort();
          if ('error' in event.data) reject(new Error(event.data.error));
          else resolve(event.data);
        },
        { signal: signal.signal },
      );
      this.worker.addEventListener(
        'error',
        (event) => {
          signal.abort();
          reject(new Error(event.message));
        },
        { signal: signal.signal },
      );
      this.worker.postMessage(request);
    });
  }

  close() {
    this.worker.terminate();
  }
}

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
    const file = fixture(selected);
    const result = await current.request({ file, width: defaultWidth });
    if (number !== generation) return;
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
    document.documentElement.dataset.labReady = 'true';
  });
}

async function verify(workload: Workload = 'examples', width = defaultWidth) {
  await fontsReady();
  const worker = new PredictionWorker();
  const file = fixture(workload);
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

const measureOnly = new URLSearchParams(location.search).has('measure');
if (!measureOnly) {
  workload.addEventListener('change', choose);
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
        const { predictedBoundaries, htmlBoundaries, ...result } = await verify(selected);
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
  document.fonts.addEventListener('loadingdone', choose);
  document.fonts.addEventListener('loadingerror', choose);
  choose();
}

declare global {
  interface Window {
    pretextPagination: {
      compare: typeof compare;
      verify: typeof verify;
      compareProductionBoundaries: typeof compareProductionBoundaries;
    };
  }
}
window.pretextPagination = { compare, verify, compareProductionBoundaries };
