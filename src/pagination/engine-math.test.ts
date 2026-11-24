import type { Node } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { mathOf, standInMathLayouter } from '../../test/math-layout-fixtures.js';
import { stubEngine } from '../../test/pages-fixtures.js';
import { placeMath } from '../layout-engine/math-atoms.js';
import { engineMath, placedMath } from './engine-math.js';

const { nodes } = documentSchema;

function stateOf() {
  const laid = standInMathLayouter().layouter.layout(mathOf(['x']), false, 20);
  if (!laid) throw new Error('the stand-in refused');
  const placed = placeMath({ math: laid }, 600);
  const mathOfNode = vi.fn((node: Node) => (node.type.name === 'math_inline' ? placed : null));
  const engine = { ...stubEngine(), mathOf: mathOfNode };
  let version = 0;
  const plugin = engineMath({ engine: () => engine, version: () => version });
  const atom = nodes.math_inline?.create(null, documentSchema.text('x'));
  const paragraph = atom && nodes.paragraph?.create(null, [documentSchema.text('a'), atom]);
  const doc = paragraph && documentSchema.topNodeType.createAndFill(null, [paragraph]);
  if (!doc) throw new Error('The document is valid');
  const state = EditorState.create({ doc, plugins: [plugin] });
  return { state, placed, mathOfNode, moveVersion: () => (version += 1) };
}

describe('engine math', () => {
  it('DOCE-PAGINATION-12.11 places each math node the engine laid out, and moves the placements with typing beside it', () => {
    const { state, placed, mathOfNode, moveVersion } = stateOf();
    expect([...placedMath(state)]).toEqual([[2, placed]]);
    const calls = mathOfNode.mock.calls.length;
    const typed = state.apply(state.tr.insertText('bb', 1));
    expect([...placedMath(typed)]).toEqual([[4, placed]]);
    expect(mathOfNode.mock.calls.length).toBe(calls);
    // Inserting math, or an engine that laid the pages out again, places them again.
    const atom = nodes.math_inline?.create(null, documentSchema.text('y'));
    if (!atom) throw new Error('The schema has math');
    const inserted = typed.apply(typed.tr.insert(1, atom));
    expect(placedMath(inserted).size).toBe(2);
    moveVersion();
    const relaid = inserted.apply(inserted.tr);
    expect(mathOfNode.mock.calls.length).toBeGreaterThan(calls + 2);
    expect(placedMath(relaid).size).toBe(2);
  });
});
