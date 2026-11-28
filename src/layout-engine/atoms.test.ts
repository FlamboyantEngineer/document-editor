import { describe, expect, it, vi } from 'vitest';
import { createDocumentSchema } from '../model/schema/document-schema.js';
import { atomKey, type AtomMeasurer, createAtomCache } from './atoms.js';

const schema = createDocumentSchema();

const math = (tex: string, dataId = 'aaaaaaaa') =>
  schema.node('math_inline', { dataId }, tex ? schema.text(tex) : undefined);
const equation = (tex: string) => schema.node('math_display', null, schema.text(tex));

function sized(width: number, height: number, baseline?: number): AtomMeasurer {
  return vi.fn(() => ({ width, height, baseline }));
}

describe('atom cache', () => {
  it('DOCE-PAGINATION-10.1 DOCE-PAGINATION-10.2 sizes an atom once and keeps it by its content', () => {
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
    const measure = vi.fn<AtomMeasurer>((_node, _width, drawing) => ({
      width: 6 * (drawing?.shown ?? '').length,
      height: 10,
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
    expect(measure).toHaveBeenLastCalledWith(marker('n2'), 0, { shown: '10' });
    numbers.set('n2', '9');
    cache.measureAtom(marker('n2'));
    expect(measure).toHaveBeenCalledTimes(2);
  });

  it('DOCE-PAGINATION-10.1 keeps an inline atom by its scope and the block it is drawn in', () => {
    const atom = math('x');
    const heading = schema.node('heading', { level: 2 });
    const other = schema.node('heading', { level: 3 });
    expect(atomKey(atom, 0, { parent: heading })).not.toBe(atomKey(atom, 0, { parent: other }));
    expect(atomKey(atom, 0, { scope: 'a' })).not.toBe(atomKey(atom, 0, { scope: 'b' }));
    // The block's own id is not what it shows.
    const named = schema.node('heading', { level: 2, dataId: 'cccccccc' });
    expect(atomKey(atom, 0, { parent: named })).toBe(atomKey(atom, 0, { parent: heading }));
    const measure = sized(10, 10);
    const cache = createAtomCache({ measure });
    cache.measureAtom(atom, { parent: heading });
    cache.measureAtom(atom, { parent: heading, scope: null });
    cache.measureAtom(atom, { parent: other });
    expect(measure).toHaveBeenCalledTimes(2);
  });

  it('DOCE-PAGINATION-10.1 keys a figure without its caption, which the engine lays out as text', () => {
    const figure = (caption: string) =>
      schema.node('figure', { src: 'https://example.org/a.png', width: 40, height: 30 }, [
        schema.node('figure_caption', null, caption ? schema.text(caption) : undefined),
      ]);
    expect(atomKey(figure('Before'), 300)).toBe(atomKey(figure('After typing'), 300));
    const other = schema.node(
      'figure',
      { src: 'https://example.org/b.png', width: 40, height: 30 },
      [schema.node('figure_caption')],
    );
    expect(atomKey(other, 300)).not.toBe(atomKey(figure(''), 300));
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
    });
    cache.measureBlockAtom(node, 300);
    cache.measureBlockAtom(node, 500);
    expect(measure).toHaveBeenCalledTimes(2);
  });

  it('DOCE-PAGINATION-10.1 keeps nothing its measurer cannot size', () => {
    const cache = createAtomCache({ measure: () => null });
    expect(cache.measureAtom(math('x'))).toBeNull();
    const broken = createAtomCache({ measure: () => ({ width: Number.NaN, height: 3 }) });
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
});
