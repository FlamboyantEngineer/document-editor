// Shows the values of the variables in page headers and footers and in the document's text: a
// page's number and the page count, as the layout numbers the pages, and the text the document
// stores for every other variable, such as today's date or a document property (DOCE-FORMAT-1.7).
// Nothing is asked of the host or the clock while the pages are laid out.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { ReplaceStep } from 'prosemirror-transform';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { LAYOUT_VARIABLES, storedValue } from '../model/index.js';
import { createPageMap } from './page-map.js';

/** Marks a transaction that shows the variables' values again, as after a host value changed. */
export const pageVariablesKey = new PluginKey<DecorationSet>('page-variables');

const REGIONS = new Set(['page_header', 'page_footer', 'page_content']);

// Where a variable is: its page's number and the page count, as its region or the document counts.
interface Place {
  readonly page: number;
  readonly pages: number;
}

/**
 * The text a variable whose value is the same on every page shows, as the pages draw it: the text
 * the document stores for it (DOCE-FORMAT-1.7); null for the page's own number and the page count.
 */
export function fixedVariableText(key: string, doc: ProseMirrorNode): string | null {
  if (LAYOUT_VARIABLES.has(key)) return null;
  return storedValue(doc, key);
}

function variableText(key: string, place: Place, doc: ProseMirrorNode) {
  if (key === 'page.current') return String(place.page);
  if (key === 'page.total') return String(place.pages);
  return storedValue(doc, key);
}

// The pages of a document, by the position of their page node, numbered through it from 1, as
// its layout reads them.
function pagesOf(doc: ProseMirrorNode): Map<number, Place> {
  const pages = createPageMap(doc).pages();
  return new Map(pages.map((page) => [page.pos, { page: page.number, pages: pages.length }]));
}

function widget(pos: number, text: string, key: string) {
  return Decoration.widget(
    pos,
    (view) => {
      const span = view.dom.ownerDocument.createElement('span');
      span.textContent = text;
      return span;
    },
    // The text, for a layout handed to a viewer or a print (`pagesLayout`).
    { key: `${key}=${text}`, ignoreSelection: true, text },
  );
}

function decorate(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  const places = pagesOf(doc);
  doc.descendants((node, pos) => {
    if (!REGIONS.has(node.type.name)) return !node.isTextblock;
    const page = places.get(doc.resolve(pos).before()) ?? { page: 0, pages: 0 };
    // A header or footer counts as its region says; the text, by its page in the document.
    const place =
      node.type.name === 'page_content'
        ? page
        : {
            page: Number(node.attrs.pageNumber ?? page.page),
            pages: Number(node.attrs.totalPages ?? page.pages),
          };
    node.descendants((child, offset) => {
      if (child.type.name !== 'template_variable') return true;
      const key = String(child.attrs.variableKey ?? '');
      const text = variableText(key, place, doc);
      // Inside the variable: past the region's start, its offset and the variable's start.
      if (text) decorations.push(widget(pos + offset + 2, text, key));
      return false;
    });
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

// Whether a variable is in a document's range.
function hasVariable(doc: ProseMirrorNode, from: number, to: number): boolean {
  let found = false;
  doc.nodesBetween(from, to, (node) => {
    if (node.type.name === 'template_variable') found = true;
    return !found;
  });
  return found;
}

// Whether a change only edits text inside a textblock, a variable neither added nor taken: the
// pages and the variables stay as they were, so the values only move with the text
// (DOCE-PAGINATION-7.19).
function editsTextOnly(tr: Transaction): boolean {
  return tr.steps.every((step, index) => {
    if (!(step instanceof ReplaceStep)) return false;
    const doc = tr.docs[index];
    const { from, to, slice } = step;
    if (!doc || slice.openStart !== 0 || slice.openEnd !== 0) return false;
    const $from = doc.resolve(from);
    if (!$from.parent.isTextblock || !$from.sameParent(doc.resolve(to))) return false;
    let added = false;
    slice.content.descendants((node) => {
      if (!node.isInline || node.type.name === 'template_variable') added = true;
      return !added;
    });
    return !added && !hasVariable(doc, from, to);
  });
}

/** A plugin that shows each variable's value inside it, in the headers, footers and text. */
export function createPageVariables(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: pageVariablesKey,
    state: {
      init: (_config, state: EditorState) => decorate(state.doc),
      apply(tr, set) {
        if (tr.getMeta(pageVariablesKey)) return decorate(tr.doc);
        if (!tr.docChanged) return set;
        return editsTextOnly(tr) ? set.map(tr.mapping, tr.doc) : decorate(tr.doc);
      },
    },
    props: { decorations: (state) => pageVariablesKey.getState(state) },
  });
}

/** Shows the variables' values again, as after the pages were numbered again. */
export function refreshPageVariables(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(pageVariablesKey, true).setMeta('addToHistory', false));
}
