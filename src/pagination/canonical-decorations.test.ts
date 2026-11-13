import type { Node } from 'prosemirror-model';
import { EditorState, Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { createLayoutRules, layoutPages, projectDocument } from '../model/index.js';
import { canonicalDecorations } from './canonical-decorations.js';
import { createProjectionMap } from './projection-map.js';

const create = (name: string, attrs: Record<string, unknown> | null, content?: Node[]) => {
  const type = documentSchema.nodes[name];
  if (!type) throw new Error(name);
  return type.create(attrs, content);
};

// One paragraph of 60 characters, laid out 12 characters to a line, 10 pixels a line, on pages
// 30 pixels tall: it splits across pages.
function splitParagraph() {
  const text = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lam';
  const node = create('paragraph', { dataId: 'p1' }, [documentSchema.text(text)]);
  const page = create('page', null, [
    create('page_header', null),
    create('page_content', null, [node]),
    create('page_footnotes', null, []),
    create('page_footer', null),
  ]);
  const whole = create('doc', null, [create('page_section', { sectionName: 'Body' }, [page])]);
  const block = {
    node,
    height: 50,
    marginTop: 0,
    marginBottom: 0,
    measurement: {
      offset: 0,
      measure: (from: number, to: number) => {
        const lines = Math.max(1, Math.ceil((to - from) / 12));
        return { height: lines * 10, lines };
      },
    },
  };
  const pages = layoutPages([block], { pageHeight: 30, rules: createLayoutRules() });
  const projection = projectDocument(whole, [pages.map((each) => each.map((b) => b.node))]);
  return createProjectionMap(projection);
}

// The projection positions of every paragraph, with the node decorations drawn on it.
function decoratedParagraphs(projection: Node, set: DecorationSet) {
  const found: { pos: number; classes: string[] }[] = [];
  projection.descendants((node, pos) => {
    if (node.type.name !== 'paragraph') return true;
    const on = set.find(pos, pos + node.nodeSize, (spec) => spec.styled === true);
    const classes = on.filter((each) => each.from === pos && each.to === pos + node.nodeSize);
    found.push({ pos, classes: classes.map(() => 'styled') });
    return false;
  });
  return found;
}

describe('canonicalDecorations', () => {
  it('DOCE-PAGINATION-7.13 draws a node decoration on each part of a block split across pages', () => {
    const map = splitParagraph();
    expect(map.projection.childCount).toBe(1);
    const parts = map.projection.child(0).childCount;
    expect(parts).toBeGreaterThan(1);
    const styled = new Plugin({
      props: {
        decorations: (state) => {
          let from = -1;
          state.doc.descendants((node, pos) => {
            if (node.type.name === 'paragraph' && from < 0) from = pos;
            return from < 0;
          });
          const node = state.doc.nodeAt(from);
          if (!node) throw new Error('no paragraph');
          return DecorationSet.create(state.doc, [
            Decoration.node(from, from + node.nodeSize, { class: 'styled' }, { styled: true }),
          ]);
        },
      },
    });
    const canonical = EditorState.create({ doc: map.canonical, plugins: [styled] });
    const plugin = canonicalDecorations({ canonical: () => canonical, map: () => map });
    const projection = EditorState.create({ doc: map.projection, plugins: [plugin] });
    const set = plugin.props.decorations?.call(plugin, projection);
    if (!(set instanceof DecorationSet)) throw new Error('no decorations');
    const drawn = decoratedParagraphs(map.projection, set);
    expect(drawn).toHaveLength(parts);
    expect(drawn.every((each) => each.classes.length === 1)).toBe(true);
  });
});
