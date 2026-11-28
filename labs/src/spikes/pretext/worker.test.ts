// @vitest-environment node
import { expect, it, vi } from 'vitest';
import type { PredictionMessage } from './protocol.js';

it('DOCE-LABS-5.1 DOCE-LABS-7.2 keeps a failed font setup for every prediction', async () => {
  const worker = new EventTarget();
  const postMessage = vi.fn();
  vi.stubGlobal('addEventListener', worker.addEventListener.bind(worker));
  vi.stubGlobal('postMessage', postMessage);
  vi.stubGlobal('name', 'measurer=font-files');
  await import('./worker.js');

  const send = (data: PredictionMessage) => {
    worker.dispatchEvent(new MessageEvent('message', { data }));
  };
  send({ setup: { faces: [], wasm: null } });
  send({ id: 1, request: { width: 150 } });
  await vi.waitFor(() => expect(postMessage).toHaveBeenCalledOnce());
  send({ id: 2, request: { width: 300 } });
  await vi.waitFor(() => expect(postMessage).toHaveBeenCalledTimes(2));
  expect(postMessage.mock.calls).toEqual([
    [{ id: 1, error: 'Font-file widths require HarfBuzz' }],
    [{ id: 2, error: 'Font-file widths require HarfBuzz' }],
  ]);
});
