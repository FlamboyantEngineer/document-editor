import { describe, expect, it } from 'vitest';
import { mathOf, standInMathLayouter } from '../../test/math-layout-fixtures.js';
import { placeMath } from '../layout-engine/math-atoms.js';
import { createDocumentSchema } from '../model/schema/document-schema.js';
import { mathPlaces } from './text-engine-atoms.js';

const schema = createDocumentSchema();

describe('math places', () => {
  it('DOCE-PAGINATION-12.10 counts only the equations of the document laid out last as too small', () => {
    const laid = standInMathLayouter().layouter.layout(mathOf(['a', 'b', 'c', 'd']), true, 20);
    if (!laid) throw new Error('the stand-in refused');
    const small = placeMath({ math: laid }, 5);
    const [kept, edited] = ['a', 'b'].map((latex) =>
      schema.node('math_display', null, [schema.text(latex)]),
    );
    if (!kept || !edited) throw new Error('no equations');
    const places = mathPlaces();
    places.record(kept, small);
    places.record(edited, small);
    let doc = schema.node('doc', null, [kept, edited]);
    const reading = places.reading(
      () => ({ laid: 0, refused: 0, reasons: new Map() }),
      () => doc,
    );
    expect(reading.stats().smallMath).toBe(2);
    // The second equation was edited: its old node is not in the document any more.
    doc = schema.node('doc', null, [kept]);
    expect(reading.stats().smallMath).toBe(1);
    expect(reading.mathOf(kept)).toBe(small);
  });

  it('DOCE-PAGINATION-12.11 finds the placement of an equal copy of the laid node by its element id', () => {
    const laid = standInMathLayouter().layouter.layout(mathOf(['a']), true, 20);
    if (!laid) throw new Error('the stand-in refused');
    const at = placeMath({ math: laid }, 500);
    const equation = (id: string, latex: string) =>
      schema.node('math_display', { dataId: id }, [schema.text(latex)]);
    const places = mathPlaces();
    places.record(equation('m1', 'a+b'), at);
    const reading = places.reading(
      () => ({ laid: 0, refused: 0, reasons: new Map() }),
      () => null,
    );
    // The pages edited the equation in their own copy of it.
    expect(reading.mathOf(equation('m1', 'a+b'))).toBe(at);
    expect(reading.mathOf(equation('m1', 'a+c'))).toBeNull();
    expect(reading.mathOf(equation('m2', 'a+b'))).toBeNull();
  });

  it('DOCE-PAGINATION-12.11 keeps a bounded number of equations by element id, the oldest let go', () => {
    const laid = standInMathLayouter().layouter.layout(mathOf(['a']), true, 20);
    if (!laid) throw new Error('the stand-in refused');
    const at = placeMath({ math: laid }, 500);
    const equation = (id: string) =>
      schema.node('math_display', { dataId: id }, [schema.text('a')]);
    const places = mathPlaces();
    for (let index = 0; index <= 4000; index += 1) places.record(equation(`m${String(index)}`), at);
    const reading = places.reading(
      () => ({ laid: 0, refused: 0, reasons: new Map() }),
      () => null,
    );
    expect(reading.mathOf(equation('m0'))).toBeNull();
    expect(reading.mathOf(equation('m4000'))).toBe(at);
  });
});
