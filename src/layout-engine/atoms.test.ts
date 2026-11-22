import { describe, expect, it, vi } from 'vitest';
import { createDocumentSchema } from '../model/schema/document-schema.js';
import { atomKey, type AtomMeasurer, createAtomCache } from './atoms.js';

const schema = createDocumentSchema();

const math = (tex: string, dataId = 'aaaaaaaa') =>
  schema.node('math_inline', { dataId }, tex ? schema.text(tex) : undefined);
const equation = (tex: string) => schema.node('math_display', null, schema.text(tex));

function sized(width: number, height: number, baseline?: number): AtomMeasurer {
  return vi.fn(() => ({ size: { width, height, baseline } }));
}

describe('atom cache', () => {
  it('DOCE-PAGINATION-10.1 measures an atom once and keeps it by its content', () => {
    const measure = sized(40, 14, 11);
    const cache = createAtomCache({ measure });
    expect(cache.measureAtom(math('x^2'))).toEqual({ width: 40, height: 14, baseline: 11 });
    // The same content under another element id is the same atom.
    expect(cache.measureAtom(math('x^2', 'bbbbbbbb'))).toEqual({
      width: 40,
      height: 14,
      baseline: 11,
    });
    expect(measure).toHaveBeenCalledTimes(1);
    cache.measureAtom(math('y^2'));
    expect(measure).toHaveBeenCalledTimes(2);
  });

  it('DOCE-PAGINATION-10.7 keeps a footnote marker by the number a view draws in it', () => {
    const measure = vi.fn<AtomMeasurer>((_node, _width, shown) => ({
      size: { width: 6 * (shown ?? '').length, height: 10 },
    }));
    const numbers = new Map<string, string>([
      ['n1', '9'],
      ['n2', '10'],
    ]);
    const cache = createAtomCache({
      measure,
      shownOf: (node) => numbers.get(String(node.attrs.dataId)),
    });
    const marker = (dataId: string) => schema.node('footnote_reference', { dataId });
    expect(cache.measureAtom(marker('n1'))?.width).toBe(6);
    expect(cache.measureAtom(marker('n2'))?.width).toBe(12);
    expect(measure).toHaveBeenLastCalledWith(marker('n2'), 0, '10');
    numbers.set('n2', '9');
    cache.measureAtom(marker('n2'));
    expect(measure).toHaveBeenCalledTimes(2);
  });

  it('DOCE-PAGINATION-10.1 keys block atoms by their width to the layout unit', () => {
    const node = equation('a + b');
    expect(atomKey(node, 300)).toBe(atomKey(node, 300.001));
    expect(atomKey(node, 300)).not.toBe(atomKey(node, 301));
    expect(atomKey(node, 300)).not.toBe(atomKey(equation('a - b'), 300));
    const measure = sized(200, 40);
    const cache = createAtomCache({ measure });
    expect(cache.measureBlockAtom(node, 300)).toEqual({
      width: 200,
      height: 40,
      baseline: undefined,
      provisional: false,
    });
    cache.measureBlockAtom(node, 300);
    cache.measureBlockAtom(node, 500);
    expect(measure).toHaveBeenCalledTimes(2);
  });

  it('DOCE-PAGINATION-10.1 measures nothing it cannot size', () => {
    const cache = createAtomCache({ measure: () => null });
    expect(cache.measureAtom(math('x'))).toBeNull();
    const broken = createAtomCache({ measure: () => ({ size: { width: Number.NaN, height: 3 } }) });
    expect(broken.measureBlockAtom(equation('x'), 100)).toBeNull();
  });

  it('DOCE-PAGINATION-10.1 keeps the most recently used atoms up to its limit', () => {
    const measure = sized(10, 10);
    const cache = createAtomCache({ measure, limit: 2 });
    cache.measureAtom(math('a'));
    cache.measureAtom(math('b'));
    cache.measureAtom(math('a'));
    cache.measureAtom(math('c'));
    expect(measure).toHaveBeenCalledTimes(3);
    cache.measureAtom(math('a'));
    expect(measure).toHaveBeenCalledTimes(3);
    cache.measureAtom(math('b'));
    expect(measure).toHaveBeenCalledTimes(4);
  });

  it('DOCE-PAGINATION-10.2 reports a provisional size until the final one arrives', async () => {
    let finish: (size: { width: number; height: number }) => void = () => undefined;
    const settled = new Promise<{ width: number; height: number }>((resolve) => {
      finish = resolve;
    });
    const cache = createAtomCache({ measure: () => ({ size: { width: 0, height: 24 }, settled }) });
    const listener = vi.fn();
    const stop = cache.subscribe(listener);
    const node = equation('\\int f');
    expect(cache.measureBlockAtom(node, 400)?.provisional).toBe(true);
    finish({ width: 320, height: 180 });
    await settled;
    await Promise.resolve();
    expect(cache.measureBlockAtom(node, 400)).toEqual({
      width: 320,
      height: 180,
      provisional: false,
    });
    expect(listener).toHaveBeenCalledWith([node]);
    stop();
  });

  it('DOCE-PAGINATION-10.2 tells every node that shares a loading atom when it settles', async () => {
    let finish: (size: { width: number; height: number }) => void = () => undefined;
    const settled = new Promise<{ width: number; height: number }>((resolve) => {
      finish = resolve;
    });
    const measure = vi.fn(() => ({ size: { width: 0, height: 0 }, settled }));
    const cache = createAtomCache({ measure });
    const listener = vi.fn();
    cache.subscribe(listener);
    const image = (dataId: string) =>
      schema.node('figure', { dataId, src: 'https://example.org/a.png' }, [
        schema.node('figure_caption'),
      ]);
    const [first, second] = [image('aaaaaaaa'), image('bbbbbbbb')];
    cache.measureBlockAtom(first, 400);
    cache.measureBlockAtom(second, 400);
    expect(measure).toHaveBeenCalledTimes(1);
    finish({ width: 80, height: 40 });
    await settled;
    await Promise.resolve();
    expect(listener).toHaveBeenCalledWith([first, second]);
  });

  it('DOCE-PAGINATION-10.2 keeps the size drawn while loading when the load fails', async () => {
    const settled = Promise.reject(new Error('not found'));
    const cache = createAtomCache({
      measure: () => ({ size: { width: 16, height: 16 }, settled }),
    });
    const listener = vi.fn();
    cache.subscribe(listener);
    const node = equation('z');
    cache.measureBlockAtom(node, 100);
    await settled.catch(() => undefined);
    await Promise.resolve();
    expect(cache.measureBlockAtom(node, 100)).toEqual({
      width: 16,
      height: 16,
      provisional: false,
    });
    expect(listener).not.toHaveBeenCalled();
  });
});
