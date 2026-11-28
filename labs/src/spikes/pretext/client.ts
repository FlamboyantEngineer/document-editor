import {
  blockTypography,
  fontString,
  markedFont,
} from '../../../../src/layout-engine/typography.js';
import { requireValue, schema } from './fixtures.js';
import { addServedFaces, loadFontSetup, servesFonts, workerName } from './fonts.js';
import type {
  LayoutRequest,
  LayoutResult,
  PredictionMessage,
  PredictionReply,
} from './protocol.js';
import { fontStacks, template } from './settings.js';

// Every font the library lays the lab's blocks out in: each block type's, and the marks'.
function fonts() {
  const { paragraph, heading, code_block: codeBlock } = schema.nodes;
  const body = requireValue(paragraph, 'paragraph').create();
  const blocks = [
    body,
    requireValue(codeBlock, 'code block').create(),
    ...Array.from({ length: 6 }, (_, index) =>
      requireValue(heading, 'heading').create({ level: index + 1 }),
    ),
  ];
  const marks = [['strong'], ['em'], ['strong', 'em'], ['code']].map((names) =>
    names.map((name) => requireValue(schema.marks[name], name).create()),
  );
  const typography = blockTypography(body, { template, fontStacks });
  return [
    ...blocks.map((node) => fontString(blockTypography(node, { template, fontStacks }).font)),
    ...marks.map((set) => fontString(markedFont(typography, set))),
  ];
}

let served: Promise<void> | undefined;
export const fontsReady = async () => {
  if (servesFonts)
    await (served ??= loadFontSetup().then(({ faces }) => addServedFaces(document.fonts, faces)));
  await Promise.all(fonts().map((font) => document.fonts.load(font)));
  await document.fonts.ready;
};

interface PendingPrediction {
  readonly resolve: (result: LayoutResult) => void;
  readonly reject: (error: Error) => void;
}

const asError = (error: unknown) => (error instanceof Error ? error : new Error(String(error)));

export class PredictionWorker {
  private readonly worker = new Worker(
    new URL('build/pretext-pagination-worker.js', document.baseURI),
    { type: 'module', name: workerName },
  );
  private readonly pending = new Map<number, PendingPrediction>();
  private readonly fonts: Promise<void>;
  private nextId = 0;
  private failure: Error | undefined;

  constructor() {
    this.worker.addEventListener('message', ({ data }: MessageEvent<PredictionReply>) => {
      const pending = this.pending.get(data.id);
      if (!pending) return;
      this.pending.delete(data.id);
      if ('error' in data) pending.reject(new Error(data.error));
      else pending.resolve(data.result);
    });
    this.worker.addEventListener('error', (event) => {
      event.preventDefault();
      this.stop(new Error(event.message));
    });
    this.worker.addEventListener('messageerror', () => {
      this.stop(new Error('Cannot read the prediction worker’s reply'));
    });
    // Font setup is sent before any request. The worker waits for the fonts before predicting.
    this.fonts = servesFonts
      ? loadFontSetup()
          .then((setup) => {
            if (!this.failure) this.send({ setup });
          })
          .catch((error: unknown) => this.stop(asError(error)))
      : Promise.resolve();
  }

  request(request: LayoutRequest): Promise<LayoutResult> {
    if (this.failure) return Promise.reject(this.failure);
    const id = ++this.nextId;
    return new Promise<LayoutResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      void this.fonts.then(() => {
        if (!this.pending.has(id)) return;
        try {
          this.send({ id, request: { scale: devicePixelRatio, ...request } });
        } catch (error) {
          this.pending.delete(id);
          reject(asError(error));
        }
      });
    });
  }

  close() {
    this.stop(new Error('Prediction worker closed'));
  }

  private send(message: PredictionMessage) {
    this.worker.postMessage(message);
  }

  private stop(error: Error) {
    if (this.failure) return;
    this.failure = error;
    this.worker.terminate();
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}
