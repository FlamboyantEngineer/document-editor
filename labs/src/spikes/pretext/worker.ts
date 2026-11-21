import { setLayoutScale, setLocale, setMeasureContext } from '@chenglou/pretext';
import type { Node } from 'prosemirror-model';
import { readFixture } from './fixtures.js';
import { type Block, indexPages, measureDocument, PreparationCache } from './prediction.js';
import type { BlockReport, LayoutRequest, LayoutResult } from './protocol.js';

if (typeof document !== 'undefined') throw new Error('Prediction must run without a DOM');
setLocale('en');
// Chrome's headless shell hints Canvas widths unless text renders with geometricPrecision, so
// widths would differ from machine to machine.
setMeasureContext(() => {
  const context = new OffscreenCanvas(1, 1).getContext('2d');
  if (!context) throw new Error('Prediction requires an OffscreenCanvas 2D context');
  context.textRendering = 'geometricPrecision';
  return context;
});

const cache = new PreparationCache();
let doc: Node | undefined;

function report({ path, width, height, lines, children }: Block): BlockReport {
  return { path, width, height, lines, children: children?.map(report) };
}

function predict(request: LayoutRequest): LayoutResult {
  const start = performance.now();
  if (request.scale !== undefined) setLayoutScale(request.scale);
  if (request.file) doc = readFixture(request.file);
  if (!doc) throw new Error('Prediction requires a document first');
  const { blocks, issues } = measureDocument(doc, request.width, cache);
  const prepared = performance.now();
  const index = issues.length ? null : indexPages(blocks, request.width);
  const portable = index
    ? {
        width: index.width,
        contentWidth: index.contentWidth,
        contentHeight: index.contentHeight,
        height: index.height,
        pages: index.pages.map((page) =>
          page.map(({ block, from, to, top, height }) => ({
            block: Number(block.path),
            from,
            to,
            width: block.width,
            height,
            top,
          })),
        ),
      }
    : null;
  return {
    index: portable,
    issues,
    measurements: request.verify ? blocks.map(report) : undefined,
    hits: cache.hits,
    misses: cache.misses,
    prepareMs: prepared - start,
    packMs: performance.now() - prepared,
  };
}

globalThis.addEventListener('message', (event: MessageEvent<LayoutRequest>) => {
  try {
    globalThis.postMessage(predict(event.data));
  } catch (error) {
    globalThis.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
});
