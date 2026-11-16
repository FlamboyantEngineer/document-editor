import type { EditorView } from 'prosemirror-view';
import { describe, expect, it, vi } from 'vitest';
import { REMEASURE_EVENT } from '../utils/remeasure.js';
import {
  awaitReady,
  beforePaintIn,
  type Remeasure,
  remeasureOn,
  settleEdits,
  watchBlockSizes,
} from './layout-triggers.js';

// A resize observer the test notifies, which tells what it follows.
function stubResizeObserver() {
  const stub = {
    observed: [] as Element[],
    unobserved: [] as Element[],
    notify: (_entries: { target: Element; size: [number, number] }[]) => undefined as void,
  };
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        stub.notify = (entries) => {
          const records = entries.map(({ target, size: [width, height] }) => ({
            target,
            contentRect: new DOMRect(0, 0, width, height),
          }));
          callback(records as unknown as ResizeObserverEntry[], this as unknown as ResizeObserver);
        };
      }
      observe(target: Element) {
        stub.observed.push(target);
      }
      unobserve(target: Element) {
        stub.unobserved.push(target);
      }
      disconnect() {}
    },
  );
  return stub;
}

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
    // Hidden, the container is of no width: its blocks keep what they measured.
    width = 0;
    resized([], {} as ResizeObserver);
    drain();
    expect(changes).toHaveLength(1);
    stop();
  });

  it('DOCE-PAGINATION-5.14 gives the elements followed that changed size, not those of no size', () => {
    const drain = stubFrames();
    const observer = stubResizeObserver();
    const changed: (readonly HTMLElement[])[] = [];
    const container = document.body.appendChild(document.createElement('div'));
    const [one, two, gone] = ['p', 'p', 'p'].map((tag) =>
      container.appendChild(document.createElement(tag)),
    );
    if (!one || !two || !gone) throw new Error('Three blocks are drawn');
    const sizes = watchBlockSizes(container, (elements) => changed.push(elements));
    sizes.watch(one);
    sizes.watch(one);
    sizes.watch(two);
    sizes.watch(gone);
    expect(observer.observed).toEqual([one, two, gone]);
    gone.remove();
    observer.notify([
      { target: one, size: [100, 20] },
      { target: two, size: [0, 0] },
      { target: gone, size: [0, 0] },
    ]);
    observer.notify([{ target: one, size: [100, 30] }]);
    drain();
    expect(changed).toEqual([[one, one]]);
    expect(observer.unobserved).toEqual([gone]);
    sizes.stop();
    container.remove();
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

describe('first layout schedule', () => {
  it('DOCE-PAGINATION-5.12 runs before the next paint, in a microtask, unless cancelled', async () => {
    const schedule = beforePaintIn(document.createElement('div'));
    const ran: string[] = [];
    schedule(() => ran.push('first'));
    const cancel = schedule(() => ran.push('cancelled'));
    cancel();
    expect(ran).toEqual([]);
    await Promise.resolve();
    expect(ran).toEqual(['first']);
  });
});

describe('settling edits', () => {
  it.each(['dragend', 'drop', 'blur'])(
    'DOCE-PAGINATION-7.1 lays out the edits made during a press that ends with %s',
    (ending) => {
      vi.useFakeTimers();
      let time = 1;
      vi.spyOn(window.performance, 'now').mockImplementation(() => time);
      try {
        const request = vi.fn();
        const measureIn = document.body.appendChild(document.createElement('div'));
        const edits = settleEdits({ measureIn, settle: 10 }, request);
        const dom = document.body.appendChild(document.createElement('div'));
        const stop = edits.watch({ dom } as unknown as EditorView);
        dom.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        edits.request();
        time += 100;
        vi.advanceTimersByTime(100);
        expect(request).not.toHaveBeenCalled();
        const target = ending === 'blur' ? window : dom;
        target.dispatchEvent(new Event(ending, { bubbles: true }));
        expect(request).toHaveBeenCalledOnce();
        stop();
      } finally {
        vi.useRealTimers();
        vi.restoreAllMocks();
      }
    },
  );
});
