import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { documentSnapshot } from '../../engine/snapshot.js';
import { BASE_TEMPLATE, readDocumentFile } from '../../model/index.js';
import { canvasPageView } from './canvas-page-view.js';

const views: EditorView[] = [];
const geometryDescriptor = Object.getOwnPropertyDescriptor(
  HTMLCanvasElement.prototype,
  'updateElementGeometry',
);
const contentDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'content');
const paintDescriptor = Object.getOwnPropertyDescriptor(
  HTMLCanvasElement.prototype,
  'requestPaint',
);

function mount() {
  const doc = readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'A real editable page' }] },
          ],
        },
      ],
    },
    documentSchema,
  ).doc;
  const view = new EditorView(document.body.appendChild(document.createElement('div')), {
    state: EditorState.create({ doc }),
    nodeViews: { page: canvasPageView },
  });
  views.push(view);
  return view;
}

function support() {
  Object.defineProperty(HTMLCanvasElement.prototype, 'updateElementGeometry', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'content', {
    configurable: true,
    value: 'drawable',
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'requestPaint', {
    configurable: true,
    value: vi.fn(),
  });
  const drawElementImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    reset: vi.fn(),
    drawElementImage,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 100.25, 200.5),
  );
  vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(1.25);
  return drawElementImage;
}

afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy();
    view.dom.parentElement?.remove();
  }
  for (const [key, descriptor] of [
    ['content', contentDescriptor],
    ['requestPaint', paintDescriptor],
    ['updateElementGeometry', geometryDescriptor],
  ] as const) {
    if (descriptor) Object.defineProperty(HTMLCanvasElement.prototype, key, descriptor);
    else Reflect.deleteProperty(HTMLCanvasElement.prototype, key);
  }
  vi.restoreAllMocks();
});

describe('HTML-in-Canvas pages', () => {
  it('DOCE-EDITOR-1.9 keeps ordinary HTML when the stable API is absent', () => {
    const view = mount();
    expect(view.dom.querySelector('canvas')).toBeNull();
    expect(view.dom.querySelector('.pm-page')).toHaveTextContent('A real editable page');
  });

  it('DOCE-EDITOR-1.9 sizes backing pixels at fractional DPR and preserves canonical content', () => {
    const draw = support();
    const view = mount();
    const before = view.state.doc;
    const canvas = view.dom.querySelector('canvas');
    canvas?.dispatchEvent(new Event('paint'));
    expect(canvas?.width).toBe(126);
    expect(canvas?.height).toBe(251);
    expect(draw).toHaveBeenCalledWith(canvas?.firstElementChild, 0, 0, 126, 251);
    expect(view.state.doc.eq(before)).toBe(true);
    view.destroy();
    draw.mockClear();
    canvas?.dispatchEvent(new Event('paint'));
    expect(draw).not.toHaveBeenCalled();
    expect(canvas?.width).toBe(0);
  });

  it.each(['paint', 'contextlost'])('DOCE-EDITOR-1.9 restores DOM after %s fails', (event) => {
    const draw = support();
    draw.mockImplementation(() => {
      throw new Error('Drawing unavailable');
    });
    const view = mount();
    view.dom.querySelector('canvas')?.dispatchEvent(new Event(event));
    expect(view.dom.querySelector('canvas')).toBeNull();
    expect(view.dom.querySelector('.pm-page')).toHaveTextContent('A real editable page');
  });

  it('DOCE-EDITOR-1.9 exports canvas pages as ordinary printable HTML', () => {
    support();
    const view = mount();
    const snapshot = new DOMParser().parseFromString(
      documentSnapshot(view, { template: BASE_TEMPLATE }),
      'text/html',
    );
    expect(snapshot.querySelector('canvas')).toBeNull();
    expect(snapshot.querySelector('.de-document-editor__canvas-page')).toBeNull();
    expect(snapshot.querySelector('.pm-section > .pm-page')?.textContent).toBe(
      'A real editable page',
    );
  });

  it('DOCE-EDITOR-1.9 retains external images in the DOM instead of losing them in a bitmap', () => {
    const draw = support();
    const view = mount();
    const image = document.createElement('img');
    image.src = 'https://example.test/picture.png';
    view.dom.querySelector('.pm-page-content')?.append(image);
    view.dom.querySelector('canvas')?.dispatchEvent(new Event('paint'));
    expect(view.dom.querySelector('canvas')).toBeNull();
    expect(view.dom.querySelector('img')).toBe(image);
    expect(draw).not.toHaveBeenCalled();
  });

  it('DOCE-EDITOR-1.9 uses DOM if a context cannot be allocated', () => {
    support();
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    const view = mount();
    expect(view.dom.querySelector('canvas')).toBeNull();
    expect(view.dom).toHaveTextContent('A real editable page');
  });

  it('DOCE-EDITOR-1.9 retains responsive images whose selected source may be external', () => {
    const draw = support();
    const view = mount();
    const image = document.createElement('img');
    image.srcset = 'https://example.test/picture.png 2x';
    view.dom.querySelector('.pm-page-content')?.append(image);
    view.dom.querySelector('canvas')?.dispatchEvent(new Event('paint'));
    expect(view.dom.querySelector('canvas')).toBeNull();
    expect(view.dom.querySelector('img')).toBe(image);
    expect(draw).not.toHaveBeenCalled();
  });
});
