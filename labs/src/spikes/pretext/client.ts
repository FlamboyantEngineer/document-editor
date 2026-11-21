import type { LayoutRequest, LayoutResult } from './protocol.js';
import { code, font, headings, paragraph } from './settings.js';

const fonts = [
  paragraph,
  ...headings,
  code,
  { ...paragraph, weight: 700 },
  { ...paragraph, italic: true },
  { ...paragraph, italic: true, weight: 700 },
  { ...paragraph, family: '"Courier New", monospace' },
];
export const fontsReady = async () => {
  await Promise.all(fonts.map((style) => document.fonts.load(font(style))));
  await document.fonts.ready;
};

export class PredictionWorker {
  private readonly worker = new Worker(
    new URL('build/pretext-pagination-worker.js', document.baseURI),
    {
      type: 'module',
    },
  );

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
      this.worker.postMessage({ scale: devicePixelRatio, ...request });
    });
  }

  close() {
    this.worker.terminate();
  }
}
