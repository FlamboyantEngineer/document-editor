// Custom styles: text styles a template defines by name (`styles.custom`), which a writer applies
// to paragraphs and headings. A block keeps the style's name (`className`); a plugin gives each
// block in a style the style's values as `--doc-custom-*` properties, in every view, so the
// stylesheet sets them and the pages measure them.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type Command, type EditorState, Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import {
  customStyleProperties,
  findTemplateSection,
  type TemplateFile,
  type TextSettings,
} from '../model/index.js';
import { documentSectionsKey } from './document-sections.js';
import { isInlineTextOnly } from './transaction-kind.js';

/** The block types a custom style applies to. */
const STYLED = new Set(['paragraph', 'heading']);

/** The names of a template's custom styles, in its order. */
export function customStyleNames(template: TemplateFile): string[] {
  return Object.keys(template.styles?.custom ?? {});
}

// The text blocks the selection covers that take a custom style, with their positions.
function styledBlocks(state: EditorState): { node: ProseMirrorNode; pos: number }[] {
  const found: { node: ProseMirrorNode; pos: number }[] = [];
  const { from, to } = state.selection;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (STYLED.has(node.type.name)) found.push({ node, pos });
    return !node.isTextblock;
  });
  return found;
}

/** The custom style of the block holding the selection, or null. */
export function customStyleAt(state: EditorState): string | null {
  const { parent } = state.selection.$from;
  const name = STYLED.has(parent.type.name) ? String(parent.attrs.className ?? '') : '';
  return name || null;
}

/** Applies a custom style to the paragraphs and headings the selection covers; null removes it. */
export function setCustomStyle(name: string | null): Command {
  return (state, dispatch) => {
    const blocks = styledBlocks(state);
    const className = name ?? '';
    if (!blocks.some(({ node }) => node.attrs.className !== className)) return false;
    if (dispatch) {
      const tr = state.tr;
      for (const { node, pos } of blocks) {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, className });
      }
      dispatch(tr);
    }
    return true;
  };
}

// The custom style a block's section sets, or the document's.
function styleFor(
  template: TemplateFile,
  section: string | null,
  name: string,
): TextSettings | null {
  const scope = findTemplateSection(template, section);
  return scope?.styles?.custom?.[name] ?? template.styles?.custom?.[name] ?? null;
}

function decorate(doc: ProseMirrorNode, template: TemplateFile): DecorationSet {
  const decorations: Decoration[] = [];
  doc.forEach((section, offset) => {
    const name = (section.attrs.sectionName as string | null) ?? null;
    section.descendants((node, pos) => {
      if (!STYLED.has(node.type.name)) return !node.isTextblock;
      const style = String(node.attrs.className ?? '');
      const settings = style ? styleFor(template, name, style) : null;
      if (!settings) return false;
      const properties = Object.entries(customStyleProperties(settings))
        .map(([property, value]) => `${property}: ${value}`)
        .join('; ');
      const from = offset + 1 + pos;
      decorations.push(
        Decoration.node(from, from + node.nodeSize, {
          'data-custom-style': style,
          style: properties,
        }),
      );
      return false;
    });
  });
  return DecorationSet.create(doc, decorations);
}

const customStylesKey = new PluginKey<DecorationSet>('custom-styles');

/** How custom styles read the template. */
export interface CustomStylesOptions {
  readonly template: () => TemplateFile;
}

/**
 * Gives each paragraph and heading in a custom style the style's values, from its section's
 * template or the document's, in every view it runs in. After the template changes, a host
 * dispatches a transaction with `customStylesKey` meta.
 */
export function createCustomStyles({ template }: CustomStylesOptions): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: customStylesKey,
    state: {
      init: (_config, state) => decorate(state.doc, template()),
      // A change of the template, which restyles the sections too, styles the blocks again. Typing
      // changes no block's style, so the styles only move with it.
      apply: (tr, value) => {
        if (tr.getMeta(customStylesKey) || tr.getMeta(documentSectionsKey))
          return decorate(tr.doc, template());
        if (!tr.docChanged) return value;
        return isInlineTextOnly(tr) ? value.map(tr.mapping, tr.doc) : decorate(tr.doc, template());
      },
    },
    props: { decorations: (state) => customStylesKey.getState(state) ?? null },
  });
}

export { customStylesKey };
