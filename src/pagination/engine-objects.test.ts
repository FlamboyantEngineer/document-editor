import type { Node } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import type { Decoration, DecorationSet } from 'prosemirror-view';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { stubEngine } from '../../test/pages-fixtures.js';
import { objectBoxHooks } from '../engine/object-box.js';
import { engineObjects } from './engine-objects.js';

const { nodes } = documentSchema;
const BOX = { inline: true, width: 120, height: 67, baseline: 67 };

function stateOf() {
  let version = 0;
  const sized = (node: Node) => node.type.name === 'signature';
  const objectOf = vi.fn((node: Node) => (sized(node) && version ? BOX : null));
  const engine = {
    ...stubEngine(),
    sizedType: sized,
    objectOf,
    objectsVersion: () => version,
  };
  const plugin = engineObjects({ engine: () => engine, version: () => 0 });
  const signature = nodes.signature?.create({ displayName: 'Ann Lee' });
  const paragraph =
    signature && nodes.paragraph?.create(null, [documentSchema.text('a'), signature]);
  const doc = paragraph && documentSchema.topNodeType.createAndFill(null, [paragraph]);
  if (!doc) throw new Error('The document is valid');
  const state = EditorState.create({ doc, plugins: [plugin] });
  const drawn = (at: EditorState): Decoration[] =>
    (plugin.props.decorations?.call(plugin, at) as DecorationSet | undefined)?.find() ?? [];
  return { state, drawn, objectOf, layOut: () => (version += 1) };
}

describe('engine objects', () => {
  it('DOCE-PAGINATION-14.2 draws a sized node in the box the engine laid it out at, once laid out', () => {
    const { state, drawn, layOut } = stateOf();
    expect(drawn(state)).toEqual([]);
    layOut();
    const [decoration] = drawn(state);
    expect(decoration?.from).toBe(2);
    expect(decoration?.spec).toEqual({ objectBox: BOX });
    expect(objectBoxHooks(BOX)).toEqual({
      class: 'de-object-box',
      'data-object-box': 'inline',
      style:
        '--de-object-height: 67.000px; --de-object-width: 120.000px; --de-object-baseline: 67.000px',
    });
    expect(objectBoxHooks({ ...BOX, inline: false }).style).toBe('--de-object-height: 67.000px');
  });

  it('DOCE-PAGINATION-14.2 moves the boxes with typing beside a sized node, and reads them again for a new one', () => {
    const { state, drawn, objectOf, layOut } = stateOf();
    layOut();
    const laid = state.apply(state.tr);
    const calls = objectOf.mock.calls.length;
    const typed = laid.apply(laid.tr.insertText('bb', 1));
    expect(drawn(typed).map((decoration) => decoration.from)).toEqual([4]);
    expect(objectOf.mock.calls.length).toBe(calls);
    const signature = nodes.signature?.create({ displayName: 'Bo' });
    if (!signature) throw new Error('The schema has signatures');
    const inserted = typed.apply(typed.tr.insert(1, signature));
    expect(drawn(inserted)).toHaveLength(2);
    expect(objectOf.mock.calls.length).toBeGreaterThan(calls);
  });
});
