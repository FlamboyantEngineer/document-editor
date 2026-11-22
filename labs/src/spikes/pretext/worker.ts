import { setLayoutScale, setMeasureContext } from '@chenglou/pretext';
import type { Node } from 'prosemirror-model';
import { createFontFileMeasurer } from '../../../../src/layout-engine/font-files/measurer.js';
import { readFixture } from './fixtures.js';
import { addServedFaces, type FontSetup, labMeasurer } from './fonts.js';
import { type Block, createPreparationCache, indexPages, measureDocument } from './prediction.js';
import type { BlockReport, LayoutRequest, LayoutResult } from './protocol.js';

if (typeof document !== 'undefined') throw new Error('Prediction must run without a DOM');

// The served fonts, given once by the page: added to the worker's own font set for Canvas, or
// read into HarfBuzz for font-file widths, which then replace Canvas as Pretext's measure.
async function useFonts({ faces, wasm }: FontSetup) {
  if (labMeasurer === 'canvas') {
    await addServedFaces((globalThis as unknown as { fonts: FontFaceSet }).fonts, faces);
    return;
  }
  if (!wasm) throw new Error('Font-file widths require HarfBuzz');
  const measurer = await createFontFileMeasurer({ wasm, faces });
  setMeasureContext(() => measurer.createContext() as unknown as OffscreenCanvasRenderingContext2D);
}

const cache = createPreparationCache();
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
    ...cache.stats(),
    prepareMs: prepared - start,
    packMs: performance.now() - prepared,
    measurer: labMeasurer,
  };
}

let ready: Promise<void> = Promise.resolve();

globalThis.addEventListener(
  'message',
  (event: MessageEvent<LayoutRequest | { setup: FontSetup }>) => {
    const { data } = event;
    if ('setup' in data) {
      ready = useFonts(data.setup);
      return;
    }
    ready = ready
      .then(() => {
        globalThis.postMessage(predict(data));
      })
      .catch((error: unknown) => {
        globalThis.postMessage({ error: error instanceof Error ? error.message : String(error) });
      });
  },
);
