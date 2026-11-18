// Footnote numbers as a reader's layout shows them. A number is not content: no transaction sets
// one, so the editing state, a shared room, the stored file and a version hold none. Each view
// draws them as decorations on the markers and entries, with the hooks a stylesheet reads, by its
// own layout's numbering: through the document, from 1 in each section, or from 1 on each page.

import { type DOMOutputSpec, DOMSerializer, type Node as ProseMirrorNode } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import {
  Decoration,
  DecorationSet,
  type DecorationSource,
  type NodeView,
  type NodeViewConstructor,
} from 'prosemirror-view';
import { documentSections, resolveFootnoteSettings, type TemplateFile } from '../model/index.js';
import { idOf, markerRanks } from './footnote-model.js';
import { isInlineTextOnly } from './transaction-kind.js';

/**
 * How footnotes are numbered: through the document, from 1 in each section (a layout without
 * pages, where each section is one page), or from 1 on each page.
 */
export type FootnoteNumbering = 'document' | 'section' | 'page';

/** A footnote marker or entry with the number its layout gives it. */
export interface NumberedFootnotePart {
  readonly pos: number;
  readonly node: ProseMirrorNode;
  readonly number: number;
}

const PARTS = new Set(['footnote_reference', 'footnote_entry']);

// The nodes each count starts again in, with their positions: the document, its sections, or its
// pages, each section of the editing state being one page and each of a projection's its own.
function scopes(doc: ProseMirrorNode, numbering: FootnoteNumbering) {
  const whole = [{ node: doc, pos: -1 }];
  if (numbering === 'document') return whole;
  if (numbering === 'section') {
    const sections = documentSections(doc);
    return sections.length > 0 ? sections : whole;
  }
  const pages: { node: ProseMirrorNode; pos: number }[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'page') return !node.isTextblock;
    pages.push({ node, pos });
    return false;
  });
  return pages.length > 0 ? pages : whole;
}

/**
 * Each footnote marker and entry of a document with its number: its footnote's place, from 1, in
 * the order of the markers' first citations, through the document or within its section or page.
 * A part whose footnote no marker in its scope cites has none. Print and the views number by it.
 */
export function numberFootnoteParts(
  doc: ProseMirrorNode,
  numbering: FootnoteNumbering = 'document',
): NumberedFootnotePart[] {
  const parts: NumberedFootnotePart[] = [];
  for (const scope of scopes(doc, numbering)) {
    const ranks = markerRanks(scope.node);
    if (ranks.size === 0) continue;
    scope.node.descendants((node, offset) => {
      if (!PARTS.has(node.type.name)) return !node.isText && !node.isAtom;
      const rank = ranks.get(idOf(node) ?? '');
      if (rank !== undefined) parts.push({ pos: scope.pos + 1 + offset, node, number: rank + 1 });
      return false;
    });
  }
  return parts;
}

/** What a footnote number decoration carries, beside its hooks. */
interface NumberSpec {
  readonly footnoteNumber: number;
}

// The attribute a footnote part's tooltip goes in, as its node type was built with.
const tooltipOf = (node: ProseMirrorNode): string =>
  typeof node.type.spec.tooltipAttribute === 'string' ? node.type.spec.tooltipAttribute : 'title';

function numberDecorations(doc: ProseMirrorNode, numbering: FootnoteNumbering | null) {
  if (!numbering) return DecorationSet.empty;
  const parts = numberFootnoteParts(doc, numbering);
  if (parts.length === 0) return DecorationSet.empty;
  return DecorationSet.create(
    doc,
    // The view draws the number and its hooks on the element itself: a renderer may wrap a node
    // view's element to carry a decoration's attributes.
    parts.map(({ pos, node, number }) =>
      Decoration.node(pos, pos + node.nodeSize, {}, {
        footnoteNumber: number,
      } satisfies NumberSpec),
    ),
  );
}

/** The number a footnote part's decorations give it, or null; for a host's own node view. */
export function footnoteNumberOf(decorations: readonly Decoration[]): number | null {
  for (const decoration of decorations) {
    const number = (decoration.spec as Partial<NumberSpec>).footnoteNumber;
    if (typeof number === 'number') return number;
  }
  return null;
}

// Shows a footnote part's number: the text of its number element, `data-footnote-number` and the
// tooltip on its element, or none of them without one.
function showNumber(
  dom: HTMLElement,
  { number, tooltip }: { readonly number: HTMLElement | null; readonly tooltip: string },
  shown: number | null,
) {
  const text = shown === null ? '' : String(shown);
  if (number && number.textContent !== text) number.textContent = text;
  if (shown === null) {
    dom.removeAttribute('data-footnote-number');
    dom.removeAttribute(tooltip);
  } else if (dom.getAttribute('data-footnote-number') !== text) {
    dom.setAttribute('data-footnote-number', text);
    dom.setAttribute(tooltip, `Footnote ${text}`);
  }
}

// A footnote part drawn as its schema draws it, with the number its decorations give it as the
// text of `numberIn` its element.
function numberedView(numberIn: (dom: HTMLElement) => HTMLElement | null): NodeViewConstructor {
  return (...[node, view, , decorations]: Parameters<NodeViewConstructor>): NodeView => {
    const toDOM = node.type.spec.toDOM;
    const spec: DOMOutputSpec = toDOM ? toDOM(node) : ['span', 0];
    const rendered = DOMSerializer.renderSpec(view.dom.ownerDocument, spec);
    const dom = rendered.dom as HTMLElement;
    const parts = { number: numberIn(dom), tooltip: tooltipOf(node) };
    let current = node;
    const show = (decorations: readonly Decoration[]) =>
      showNumber(dom, parts, footnoteNumberOf(decorations));
    show(decorations);
    return {
      dom,
      contentDOM: rendered.contentDOM ?? null,
      update(next, decorations) {
        if (!next.sameMarkup(current)) return false;
        current = next;
        show(decorations);
        return true;
      },
      // The number is drawn here, never typed.
      ignoreMutation: (mutation) =>
        mutation.type !== 'selection' && Boolean(parts.number?.contains(mutation.target)),
    };
  };
}

const NUMBERED_VIEWS: Readonly<Record<string, NodeViewConstructor>> = {
  footnote_reference: numberedView((dom) => dom),
  footnote_entry: numberedView((dom) =>
    dom.querySelector<HTMLElement>('.pm-footnote-entry-number'),
  ),
};

/** How a view numbers its footnotes. */
export interface FootnoteNumbersOptions {
  /**
   * The numbering the view's layout shows, read again when the numbers are; null shows none, as in
   * a state whose footnotes another view numbers. Through the document by default.
   */
  readonly numbering?: (() => FootnoteNumbering | null) | undefined;
}

/** The numbers a view draws, and the numbering a transaction set for it, if any. */
interface FootnoteNumbersState {
  readonly set: DecorationSet;
  readonly numbering?: FootnoteNumbering | null | undefined;
}

/**
 * Marks a transaction after which the footnotes are numbered again: `true`, as after a layout
 * change, or `{ numbering }`, which then holds in place of the option's, as a layout that knows its
 * template sets it (`renumberFootnotes`).
 */
export const footnoteNumbersKey = new PluginKey<FootnoteNumbersState>('footnote-numbers');

/** What a transaction tells the footnote numbers. */
export type FootnoteNumbersMeta = true | { readonly numbering: FootnoteNumbering | null };

/** Has the footnotes numbered again after a transaction, by a numbering from now on if given. */
export function renumberFootnotes(
  tr: Transaction,
  numbering?: FootnoteNumbering | null,
): Transaction {
  const meta: FootnoteNumbersMeta = numbering === undefined ? true : { numbering };
  return tr.setMeta(footnoteNumbersKey, meta);
}

/**
 * Draws each footnote marker's and entry's number (`numberFootnoteParts`) on the view: its text, and
 * `data-footnote-number` and a tooltip on the element. The numbers are decorations, never content.
 * They are counted again after any change but typing or deleting text in one text block, which
 * moves no marker and only maps them, and after a transaction with `footnoteNumbersKey` meta; a
 * remote change is numbered as a local one, and nothing is written back.
 */
export function createFootnoteNumbers({
  numbering = () => 'document',
}: FootnoteNumbersOptions = {}): Plugin<FootnoteNumbersState> {
  const numberingOf = (value: FootnoteNumbersState) =>
    value.numbering === undefined ? numbering() : value.numbering;
  return new Plugin<FootnoteNumbersState>({
    key: footnoteNumbersKey,
    state: {
      init: (_config, state) => ({ set: numberDecorations(state.doc, numbering()) }),
      apply(...[tr, value, , after]) {
        const meta = tr.getMeta(footnoteNumbersKey) as FootnoteNumbersMeta | undefined;
        const next = typeof meta === 'object' ? { ...value, numbering: meta.numbering } : value;
        if (meta !== undefined || (tr.docChanged && !isInlineTextOnly(tr)))
          return { ...next, set: numberDecorations(after.doc, numberingOf(next)) };
        return tr.docChanged ? { ...next, set: value.set.map(tr.mapping, tr.doc) } : next;
      },
    },
    props: {
      decorations: (state: EditorState): DecorationSource | null =>
        footnoteNumbersKey.getState(state)?.set ?? null,
      nodeViews: NUMBERED_VIEWS,
    },
  });
}

/**
 * The numbering of a view without pages, such as the web layout, where each section is one page:
 * in each section when the template numbers footnotes on each page, through the document otherwise.
 */
export const unpagedNumbering = (template: TemplateFile | undefined): FootnoteNumbering =>
  template && resolveFootnoteSettings(template, null).numbering === 'page' ? 'section' : 'document';

/**
 * The plugins with their own footnote numbers in place of any they hold, such as the editing
 * state's, for a view that numbers by its own layout: the pages, or the view that measures them.
 */
export function withFootnoteNumbers(
  plugins: readonly Plugin[],
  numbering: FootnoteNumbering = 'document',
): Plugin[] {
  const own = plugins.filter((plugin) => plugin.spec.key !== footnoteNumbersKey);
  return [...own, createFootnoteNumbers({ numbering: () => numbering })];
}
