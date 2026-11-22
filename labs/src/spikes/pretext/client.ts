import {
  blockTypography,
  fontString,
  markedFont,
} from '../../../../src/layout-engine/typography.js';
import { requireValue, schema } from './fixtures.js';
import type { LayoutRequest, LayoutResult } from './protocol.js';
import { template } from './settings.js';

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
  const typography = blockTypography(body, { template });
  return [
    ...blocks.map((node) => fontString(blockTypography(node, { template }).font)),
    ...marks.map((set) => fontString(markedFont(typography, set))),
  ];
}

export const fontsReady = async () => {
  await Promise.all(fonts().map((font) => document.fonts.load(font)));
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
