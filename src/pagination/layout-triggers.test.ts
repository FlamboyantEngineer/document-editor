import { describe, expect, it, vi } from 'vitest';
import { REMEASURE_EVENT } from '../utils/remeasure.js';
import { awaitReady, type Remeasure, remeasureOn } from './layout-triggers.js';

// Runs animation frames when the test says, so the events of one frame gather.
function stubFrames() {
  const queue: FrameRequestCallback[] = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((run) => queue.push(run));
  return () => {
    for (const run of queue.splice(0)) run(0);
  };
}

describe('remeasure triggers', () => {
  it('DOCE-PAGINATION-5.4 names the elements that changed size, once a frame', () => {
    const drain = stubFrames();
    const container = document.body.appendChild(document.createElement('div'));
    const math = container.appendChild(document.createElement('span'));
    const image = container.appendChild(document.createElement('img'));
    const changes: Remeasure[] = [];
    const stop = remeasureOn(container, (change) => changes.push(change));
    math.dispatchEvent(new Event(REMEASURE_EVENT, { bubbles: true }));
    image.dispatchEvent(new Event('load'));
    image.dispatchEvent(new Event('error'));
    drain();
    expect(changes).toEqual([{ targets: [math, image, image], all: false }]);
    stop();
    math.dispatchEvent(new Event(REMEASURE_EVENT, { bubbles: true }));
    drain();
    expect(changes).toHaveLength(1);
    container.remove();
  });

  it('DOCE-PAGINATION-5.4 tells of a change of the content width, and not of the same width', () => {
    const drain = stubFrames();
    let resized: ResizeObserverCallback = () => undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resized = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    let width = 600;
    const container = document.createElement('div');
    vi.spyOn(container, 'getBoundingClientRect').mockImplementation(
      () => new DOMRect(0, 0, width, 100),
    );
    const changes: Remeasure[] = [];
    const stop = remeasureOn(container, (change) => changes.push(change));
    resized([], {} as ResizeObserver);
    drain();
    expect(changes).toEqual([]);
    width = 500;
    resized([], {} as ResizeObserver);
    drain();
    expect(changes).toEqual([{ targets: [], all: true }]);
    stop();
  });

  it("DOCE-PAGINATION-5.6 tells of font faces loading in the container's document", () => {
    const drain = stubFrames();
    const fonts = new EventTarget();
    Object.defineProperty(document, 'fonts', { value: fonts, configurable: true });
    const container = document.createElement('div');
    const changes: Remeasure[] = [];
    const stop = remeasureOn(container, (change) => changes.push(change));
    fonts.dispatchEvent(new Event('loadingdone'));
    drain();
    expect(changes).toEqual([{ targets: [], all: true }]);
    stop();
    fonts.dispatchEvent(new Event('loadingdone'));
    drain();
    expect(changes).toHaveLength(1);
    Reflect.deleteProperty(document, 'fonts');
  });

  it('DOCE-PAGINATION-5.6 waits for what the measurements wait for, loaded or failed', async () => {
    const settled: string[] = [];
    expect(awaitReady(undefined, () => settled.push('none')).waiting()).toBe(false);
    const loaded = awaitReady(Promise.resolve(), () => settled.push('loaded'));
    const failed = awaitReady(Promise.reject(new Error('offline')), () => settled.push('failed'));
    expect([loaded.waiting(), failed.waiting()]).toEqual([true, true]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect([loaded.waiting(), failed.waiting()]).toEqual([false, false]);
    expect(settled).toEqual(['loaded', 'failed']);
  });
});
