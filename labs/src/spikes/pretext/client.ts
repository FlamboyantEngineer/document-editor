import { addServedFaces, loadFontSetup, servesFonts, workerName } from './fonts.js';
import type { LayoutRequest, LayoutResult } from './protocol.js';
import { code, font, headings, inlineCodeFamily, paragraph } from './settings.js';

const fonts = [
  paragraph,
  ...headings,
  code,
  { ...paragraph, weight: 700 },
  { ...paragraph, italic: true },
  { ...paragraph, italic: true, weight: 700 },
  { ...paragraph, family: inlineCodeFamily },
];
let served: Promise<void> | undefined;
export const fontsReady = async () => {
  if (servesFonts)
    await (served ??= loadFontSetup().then(({ faces }) => addServedFaces(document.fonts, faces)));
  await Promise.all(fonts.map((style) => document.fonts.load(font(style))));
  await document.fonts.ready;
};

export class PredictionWorker {
  private readonly worker = new Worker(
    new URL('build/pretext-pagination-worker.js', document.baseURI),
    { type: 'module', name: workerName },
  );
  // The worker's fonts, and HarfBuzz for font-file widths, go first; it answers nothing for them.
  private readonly fonts = servesFonts
    ? loadFontSetup().then((setup) => {
        this.worker.postMessage({ setup });
      })
    : Promise.resolve();

  async request(request: LayoutRequest) {
    await this.fonts;
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
      this.worker.postMessage({ scale: devicePixelRatio, ...request });
    });
  }

  close() {
    this.worker.terminate();
  }
}
