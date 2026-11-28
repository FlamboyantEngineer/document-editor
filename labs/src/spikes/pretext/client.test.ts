import { describe, expect, it, vi } from 'vitest';
import { PredictionWorker } from './client.js';
import type { LayoutResult, PredictionMessage, PredictionReply } from './protocol.js';

class FakeWorker extends EventTarget {
  readonly sent: PredictionMessage[] = [];
  readonly terminate = vi.fn();

  postMessage(message: PredictionMessage) {
    this.sent.push(message);
  }

  respond(reply: PredictionReply) {
    this.dispatchEvent(new MessageEvent('message', { data: reply }));
  }
}

function openWorker() {
  const worker = new FakeWorker();
  vi.stubGlobal('Worker', function () {
    return worker;
  });
  return { worker, client: new PredictionWorker() };
}

const result: LayoutResult = {
  index: null,
  issues: [],
  hits: 0,
  misses: 0,
  prepareMs: 0,
  packMs: 0,
  measurer: 'canvas',
};

describe('PredictionWorker', () => {
  it('DOCE-LABS-5.1 gives each concurrent request its own reply', async () => {
    const { worker, client } = openWorker();
    const first = client.request({ width: 150 });
    const second = client.request({ width: 300 });
    const failed = expect(first).rejects.toThrow('Could not predict');
    await Promise.resolve();
    const [one, two] = worker.sent;
    if (!one || !two || !('id' in one) || !('id' in two)) throw new Error('Requests not sent');
    expect([one.request.width, two.request.width]).toEqual([150, 300]);
    worker.respond({ id: two.id, result });
    worker.respond({ id: one.id, error: 'Could not predict' });
    await expect(second).resolves.toBe(result);
    await failed;
    client.close();
  });

  it('DOCE-LABS-5.1 rejects waiting and later requests when closed', async () => {
    const { worker, client } = openWorker();
    const sent = expect(client.request({ width: 150 })).rejects.toThrow('closed');
    await Promise.resolve();
    const queued = expect(client.request({ width: 300 })).rejects.toThrow('closed');
    client.close();
    await Promise.all([sent, queued]);
    await expect(client.request({ width: 600 })).rejects.toThrow('closed');
    expect(worker.sent).toHaveLength(1);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('DOCE-LABS-5.1 rejects all requests after a worker error', async () => {
    const { worker, client } = openWorker();
    const pending = expect(client.request({ width: 150 })).rejects.toThrow('Worker stopped');
    worker.dispatchEvent(new ErrorEvent('error', { message: 'Worker stopped' }));
    await pending;
    await expect(client.request({ width: 300 })).rejects.toThrow('Worker stopped');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
