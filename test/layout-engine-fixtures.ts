// A stand-in for the text layout engine in block geometry tests: every character is 6px wide,
// lines break at the width, and each kind of text block has its own line height and margins, so
// a test can work out every height by hand.

import type { Node as ProseMirrorNode, Schema } from 'prosemirror-model';
import { type AtomMeasurer, createAtomCache } from '../src/layout-engine/atoms.js';
import { createBlockLayout } from '../src/layout-engine/blocks/block-layout.js';
import { blockMetrics } from '../src/layout-engine/blocks/metrics.js';
import type { BlockTextLayout, TextLines } from '../src/layout-engine/blocks/types.js';
import type { TemplateFile } from '../src/model/index.js';
import { BASE_TEMPLATE } from '../src/model/templates/base-template.js';

/** Each character's width in the stand-in. */
export const CHARACTER_WIDTH = 6;

/** The stand-in's line height and margins for each text block type. */
export const TEXT_STYLES: Readonly<
  Record<string, { line: number; marginTop: number; marginBottom: number; padding?: number }>
> = {
  paragraph: { line: 18, marginTop: 0, marginBottom: 8 },
  heading: { line: 26, marginTop: 20, marginBottom: 10 },
  code_block: { line: 15, marginTop: 10, marginBottom: 10, padding: 8 },
  table_caption: { line: 16, marginTop: 0, marginBottom: 0 },
  figure_caption: { line: 16, marginTop: 0, marginBottom: 0 },
  code_caption: { line: 16, marginTop: 0, marginBottom: 0 },
  footnote_entry: { line: 14, marginTop: 0, marginBottom: 0 },
};

function styleOf(node: ProseMirrorNode) {
  const style = TEXT_STYLES[node.type.name];
  if (!style) throw new Error(`no stand-in style for ${node.type.name}`);
  return style;
}

/** The stand-in's lines: as many characters as fit the width on each, at least one line. */
export function standInLines(node: ProseMirrorNode, width: number, prefix = ''): TextLines {
  const style = styleOf(node);
  const padding = style.padding ?? 0;
  const perLine = Math.max(1, Math.floor((width - 2 * padding) / CHARACTER_WIDTH));
  const length = prefix.length + node.content.size;
  const count = Math.max(1, Math.ceil(length / perLine));
  const lines = Array.from({ length: count }, (_, index) => ({
    from: Math.max(0, index * perLine - prefix.length),
    height: style.line,
  }));
  return { lines, height: count * style.line, overhead: 2 * padding };
}

/** The stand-in text layout; `refuse` names block types it cannot lay out. */
export function standInTextLayout(refuse: readonly string[] = []): BlockTextLayout {
  return {
    typography: (node) => {
      const { marginTop, marginBottom } = styleOf(node);
      return { marginTop, marginBottom };
    },
    layoutText: (node, place) =>
      refuse.includes(node.type.name)
        ? { ok: false, reason: `${node.type.name} is not supported by the stand-in` }
        : { ok: true, table: standInLines(node, place.width, place.prefix) },
  };
}

/** Block geometry over the stand-in, a template and an atom measurer. */
export function standInBlockLayout({
  template = BASE_TEMPLATE,
  measure = () => ({ size: { width: 120, height: 40 } }),
  refuse = [],
  labelOf,
}: {
  template?: TemplateFile;
  measure?: AtomMeasurer;
  refuse?: readonly string[];
  labelOf?: (caption: ProseMirrorNode) => string | undefined;
} = {}) {
  const atoms = createAtomCache({ measure });
  const layout = createBlockLayout({
    text: standInTextLayout(refuse),
    atoms,
    metrics: (scope) => blockMetrics(template, scope),
    labelOf,
  });
  return { layout, atoms };
}

/** Builds nodes of the document schema for block geometry tests. */
export function blockBuilders(schema: Schema) {
  const text = (length: number, character = 'a') => schema.text(character.repeat(length));
  const node = (
    type: string,
    attrs: Record<string, unknown> | null,
    content: ProseMirrorNode[] = [],
  ) => schema.node(type, attrs, content);
  return {
    node,
    paragraph: (length: number) => node('paragraph', null, length ? [text(length)] : []),
    heading: (length: number, level = 1) => node('heading', { level }, [text(length)]),
    code: (length: number, attrs: Record<string, unknown> | null = null) =>
      node('code_block', attrs, [text(length, 'x')]),
    item: (...content: ProseMirrorNode[]) => node('list_item', null, content),
    list: (...items: ProseMirrorNode[]) => node('bullet_list', null, items),
    cell: (length: number, attrs: Record<string, unknown> | null = null) =>
      node('table_cell', attrs, [node('paragraph', null, [text(length)])]),
    row: (...cells: ProseMirrorNode[]) => node('table_row', null, cells),
    table: (attrs: Record<string, unknown> | null, ...rows: ProseMirrorNode[]) =>
      node('table', attrs, rows),
    caption: (type: string, length: number) => node(type, null, length ? [text(length, 'c')] : []),
  };
}
