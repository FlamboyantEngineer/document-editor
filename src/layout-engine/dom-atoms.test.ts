import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDocumentSchema } from '../model/schema/document-schema.js';
import { createAtomCache } from './atoms.js';
import { createDomAtomMeasurer } from './dom-atoms.js';

const schema = createDocumentSchema();

// jsdom lays nothing out: each element reports the box a test gives its tag.
function stubBoxes(boxes: Record<string, { top: number; width: number; height: number }>) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const box = boxes[this.tagName.toLowerCase()] ?? { top: 0, width: 0, height: 0 };
    return DOMRect.fromRect({ x: 0, y: box.top, width: box.width, height: box.height });
  });
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('DOM atom measurer', () => {
  it('DOCE-PAGINATION-10.2 draws a block atom at its width, reads its box and removes it', () => {
    const host = document.createElement('div');
    document.body.append(host);
    stubBoxes({ figure: { top: 0, width: 320, height: 180 } });
    const render = vi.fn(() => document.createElement('figure'));
    const measure = createDomAtomMeasurer({ host, render });
    const figure = schema.node('figure', { src: 'https://example.org/a.png' }, [
      schema.node('figure_caption'),
    ]);
    expect(measure(figure, 400)).toEqual({ size: { width: 320, height: 180 } });
    expect(render).toHaveBeenCalledWith(figure);
    expect(host.childElementCount).toBe(0);
  });

  it('DOCE-PAGINATION-10.2 reads an inline atom’s baseline from a probe beside it', () => {
    const host = document.createElement('div');
    document.body.append(host);
    stubBoxes({ var: { top: 10, width: 48, height: 20 }, img: { top: 26, width: 0, height: 0 } });
    const measure = createDomAtomMeasurer({ host, render: () => document.createElement('var') });
    const cache = createAtomCache({ measure });
    const math = schema.node('math_inline', null, [schema.text('x')]);
    expect(cache.measureAtom(math)).toEqual({ width: 48, height: 20, baseline: 16 });
  });

  it('DOCE-PAGINATION-10.2 reports a provisional size until its images load', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    stubBoxes({ figure: { top: 0, width: 0, height: 24 } });
    let image: HTMLImageElement | null = null;
    const render = () => {
      const element = document.createElement('figure');
      image = document.createElement('img');
      image.setAttribute('loading', 'lazy');
      image.src = 'https://example.org/a.png';
      element.append(image);
      return element;
    };
    const cache = createAtomCache({ measure: createDomAtomMeasurer({ host, render }) });
    const listener = vi.fn();
    cache.subscribe(listener);
    const figure = schema.node('figure', null, [schema.node('figure_caption')]);
    expect(cache.measureBlockAtom(figure, 400)).toMatchObject({ height: 24, provisional: true });
    const drawn = image as HTMLImageElement | null;
    expect(drawn?.getAttribute('loading')).toBe('eager');
    stubBoxes({ figure: { top: 0, width: 300, height: 200 } });

    drawn?.dispatchEvent(new Event('load'));
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith([figure]));
    expect(cache.measureBlockAtom(figure, 400)).toEqual({
      width: 300,
      height: 200,
      provisional: false,
    });
    expect(host.childElementCount).toBe(0);
  });

  it('DOCE-PAGINATION-10.2 draws an atom with the schema’s markup by default', () => {
    const host = document.createElement('div');
    document.body.append(host);
    stubBoxes({ hr: { top: 0, width: 400, height: 2 } });
    const measure = createDomAtomMeasurer({ host });
    expect(measure(schema.node('horizontal_rule'), 400)).toEqual({
      size: { width: 400, height: 2 },
    });
  });
});
