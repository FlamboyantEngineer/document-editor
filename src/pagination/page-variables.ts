// Shows the values of the variables in page headers and footers: a page's number and the page
// count from its region, and any other variable, such as a document property, from the host.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';

/** A variable's text, or nothing to show none. */
export type VariableValue = (key: string) => string | null | undefined;

/** How page variables get their values. */
export interface PageVariablesOptions {
  /** The text of a variable other than `page.current` and `page.total`, such as `document.name`. */
  value?: VariableValue | undefined;
}

/** Marks a transaction that shows the variables' values again, as after a host value changed. */
export const pageVariablesKey = new PluginKey<DecorationSet>('page-variables');

const REGIONS = new Set(['page_header', 'page_footer']);

function variableText(key: string, region: ProseMirrorNode, value: VariableValue | undefined) {
  if (key === 'page.current') return String(region.attrs.pageNumber ?? '');
  if (key === 'page.total') return String(region.attrs.totalPages ?? '');
  return value?.(key) ?? '';
}

function widget(pos: number, text: string, key: string) {
  return Decoration.widget(
    pos,
    () => {
      const span = document.createElement('span');
      span.textContent = text;
      return span;
    },
    { key: `${key}=${text}`, ignoreSelection: true },
  );
}

function decorate(doc: ProseMirrorNode, value: VariableValue | undefined): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!REGIONS.has(node.type.name)) return node.type.name !== 'page_content';
    node.descendants((child, offset) => {
      if (child.type.name !== 'template_variable') return true;
      const key = String(child.attrs.variableKey ?? '');
      const text = variableText(key, node, value);
      // Inside the variable: past the region's start, its offset and the variable's start.
      if (text) decorations.push(widget(pos + offset + 2, text, key));
      return false;
    });
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

/** A plugin that shows each header and footer variable's value inside it. */
export function createPageVariables({ value }: PageVariablesOptions = {}): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: pageVariablesKey,
    state: {
      init: (_config, state: EditorState) => decorate(state.doc, value),
      apply: (tr, set) =>
        tr.docChanged || tr.getMeta(pageVariablesKey) ? decorate(tr.doc, value) : set,
    },
    props: { decorations: (state) => pageVariablesKey.getState(state) },
  });
}

/** Shows the variables' values again, after a value the host gives changed. */
export function refreshPageVariables(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(pageVariablesKey, true).setMeta('addToHistory', false));
}
