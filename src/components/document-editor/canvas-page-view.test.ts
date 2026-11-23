import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorView, NodeView } from 'prosemirror-view';
import { afterEach, describe, expect, it } from 'vitest';
import { createDocumentSchema } from '../../model/index.js';
import { canvasPageView } from './canvas-page-view.js';

// jsdom has no HTML-in-Canvas API: these tests give its canvas the API's shape (the `content`
// attribute reflected, `requestPaint`, `updateElementGeometry` and a context that draws elements),
// and fire the `paint` event the browser would.

const schema = createDocumentSchema();
const pageNode = (): ProseMirrorNode => {
  const page = schema.nodes['page']?.createAndFill();
  if (!page) throw new Error('No page node.');
  return page;
};

interface FakeApi {
  readonly drawn: [Element, number, number, number, number][];
  readonly geometry: Element[];
}

const prototype = HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
const originalContext = HTMLCanvasElement.prototype.getContext;

function installApi(): FakeApi {
  const api: FakeApi = { drawn: [], geometry: [] };
  Object.defineProperty(HTMLCanvasElement.prototype, 'content', {
    configurable: true,
    get(this: HTMLCanvasElement) {
      return this.getAttribute('content') ?? 'fallback';
    },
  });
  prototype['requestPaint'] = function requestPaint() {};
  prototype['updateElementGeometry'] = (element: Element) => api.geometry.push(element);
  HTMLCanvasElement.prototype.getContext = function getContext() {
    return {
      reset() {},
      drawElementImage: (...args: [Element, number, number, number, number]) =>
        api.drawn.push(args),
    };
  } as unknown as typeof originalContext;
  return api;
}

afterEach(() => {
  Reflect.deleteProperty(HTMLCanvasElement.prototype, 'content');
  Reflect.deleteProperty(prototype, 'requestPaint');
  Reflect.deleteProperty(prototype, 'updateElementGeometry');
  HTMLCanvasElement.prototype.getContext = originalContext;
});

function mountPage(node = pageNode()): NodeView {
  const dom = document.createElement('div');
  document.body.append(dom);
  const view = { dom } as unknown as EditorView;
  const shown = canvasPageView(node, view, () => 0, [], {} as never);
  dom.append(shown.dom);
  return shown;
}

// Gives the canvas a box of `width` by `height` CSS pixels and fires the browser's paint.
function paint(canvas: HTMLCanvasElement, width: number, height: number) {
  canvas.getBoundingClientRect = () => new DOMRect(10, 20, width, height);
  canvas.dispatchEvent(new Event('paint'));
}

describe('canvasPageView', () => {
  it('DOCE-EDITOR-1.9 keeps the page in the DOM where the browser has no HTML-in-Canvas API', () => {
    const shown = mountPage();
    expect(shown.dom).toHaveClass('pm-page');
    expect(shown.dom).toHaveAttribute('data-canvas-fallback', 'unsupported');
    expect(shown.contentDOM).toBe(shown.dom);
    expect(document.querySelector('canvas')).toBeNull();
  });

  it('DOCE-EDITOR-1.9 holds the page in a canvas and paints it at the canvas’s pixel size', () => {
    const api = installApi();
    const shown = mountPage();
    const canvas = shown.dom.firstElementChild as HTMLCanvasElement;
    expect(shown.dom).toHaveClass('de-document-editor__canvas-page');
    expect(canvas).toHaveClass('de-document-editor__canvas');
    expect(canvas).toHaveAttribute('content', 'drawable');
    const page = canvas.firstElementChild;
    expect(page).toHaveClass('pm-page');
    expect(shown.contentDOM).toBe(page);
    expect(page).toHaveAttribute('drawable', '');
    paint(canvas, 794, 1123);
    expect([canvas.width, canvas.height]).toEqual([794, 1123]);
    expect(api.drawn).toEqual([[page, 0, 0, 794, 1123]]);
    expect(api.geometry).toEqual([page]);
  });

  it('DOCE-EDITOR-1.9 rounds the bitmap to the pixels the canvas’s edges snap to', () => {
    const api = installApi();
    const shown = mountPage();
    const canvas = shown.dom.firstElementChild as HTMLCanvasElement;
    // From 10.4 to 803.9 CSS pixels: 10 to 804 on the pixel grid, 794 pixels wide.
    canvas.getBoundingClientRect = () => new DOMRect(10.4, 20, 793.5, 100.2);
    canvas.dispatchEvent(new Event('paint'));
    expect([canvas.width, canvas.height]).toEqual([794, 100]);
    expect(api.drawn[0]?.slice(3)).toEqual([794, 100]);
  });

  it('DOCE-EDITOR-1.9 puts the page back in the DOM when it holds media the canvas leaves out', () => {
    const api = installApi();
    const shown = mountPage();
    const canvas = shown.dom.firstElementChild as HTMLCanvasElement;
    const image = document.createElement('img');
    image.src = 'https://media.example/picture.png';
    canvas.querySelector('.pm-page')?.append(image);
    paint(canvas, 794, 1123);
    expect(api.drawn).toEqual([]);
    expect(shown.dom.querySelector('canvas')).toBeNull();
    expect(shown.dom.firstElementChild).toHaveClass('pm-page');
    expect(shown.dom.firstElementChild).toHaveAttribute('data-canvas-fallback', 'media');
  });

  it('DOCE-EDITOR-1.9 puts the page back in the DOM when a canvas that large cannot be made', () => {
    const api = installApi();
    const shown = mountPage();
    const canvas = shown.dom.firstElementChild as HTMLCanvasElement;
    paint(canvas, 800, 20_000);
    expect(api.drawn).toEqual([]);
    expect(shown.dom.firstElementChild).toHaveClass('pm-page');
    expect(shown.dom.firstElementChild).toHaveAttribute('data-canvas-fallback', 'size');
  });

  it('DOCE-EDITOR-1.9 puts the page back in the DOM when a paint fails', () => {
    installApi();
    HTMLCanvasElement.prototype.getContext = function getContext() {
      return {
        reset() {},
        drawElementImage() {
          throw new Error('Not painted.');
        },
      };
    } as unknown as typeof originalContext;
    const shown = mountPage();
    paint(shown.dom.firstElementChild as HTMLCanvasElement, 794, 1123);
    expect(shown.dom.firstElementChild).toHaveClass('pm-page');
    expect(shown.dom.firstElementChild).toHaveAttribute('data-canvas-fallback', 'paint');
    expect(shown.dom.firstElementChild).not.toHaveAttribute('drawable');
  });

  it('DOCE-EDITOR-1.9 leaves painting to itself and edits in the page to the view', () => {
    installApi();
    const shown = mountPage();
    const canvas = shown.dom.firstElementChild as HTMLCanvasElement;
    const page = canvas.firstElementChild as HTMLElement;
    const record = (type: MutationRecordType, target: Node) =>
      ({ type, target }) as unknown as MutationRecord;
    expect(shown.ignoreMutation?.(record('attributes', canvas))).toBe(true);
    expect(shown.ignoreMutation?.(record('attributes', page))).toBe(true);
    expect(shown.ignoreMutation?.(record('childList', page))).toBe(false);
    expect(shown.ignoreMutation?.(record('characterData', page))).toBe(false);
    expect(shown.ignoreMutation?.(record('selection' as MutationRecordType, page))).toBe(false);
  });

  it('DOCE-EDITOR-1.9 gives the bitmap back and stops painting once destroyed', () => {
    const api = installApi();
    const shown = mountPage();
    const canvas = shown.dom.firstElementChild as HTMLCanvasElement;
    paint(canvas, 794, 1123);
    shown.destroy?.();
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
    paint(canvas, 794, 1123);
    expect(api.drawn).toHaveLength(1);
  });
});
