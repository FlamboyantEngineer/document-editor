// The template variables of the pages' body text, for the text layout engine (DOCE-PAGINATION-11.13):
// what each shows, as the page variables draw it, the key a kept layout of a block holding some
// must match, and whether a document's body holds a page variable, whose box's digits settle
// with the page count as a list of contents' page boxes do.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type BodyVariables, PAGE_VARIABLES } from '../layout-engine/body-variables.js';
import { fixedVariableText } from './page-variables.js';

const NONE: readonly string[] = [];

// The keys of the variables in each node, kept for as long as the node is.
const keysHeld = new WeakMap<ProseMirrorNode, readonly string[]>();

/** The keys of the template variables in a node, in order. */
function variableKeysOf(node: ProseMirrorNode): readonly string[] {
  if (node.type.name === 'template_variable') return [String(node.attrs.variableKey ?? '')];
  if (node.isText || node.isLeaf) return NONE;
  let keys = keysHeld.get(node);
  if (!keys) {
    const found: string[] = [];
    node.forEach((child) => found.push(...variableKeysOf(child)));
    keys = found.length ? found : NONE;
    keysHeld.set(node, keys);
  }
  return keys;
}

/**
 * What the body text's variables show: the texts the document the pages are numbered with stores
 * (DOCE-FORMAT-1.7), and the digits the lists of contents' page boxes keep room for.
 */
export function bodyVariablesOf(
  numbered: () => { readonly doc: ProseMirrorNode | null },
  contents: { digits(): number },
): BodyVariables {
  return {
    text: (key) => {
      const { doc } = numbered();
      return doc ? (fixedVariableText(key, doc) ?? '') : '';
    },
    digits: () => contents.digits(),
  };
}

/**
 * What a node's variables show, as a key a kept layout of it must match: each one's text, or the
 * digits a page variable's box keeps room for; empty for a node with none.
 */
export function bodyVariablesKey(node: ProseMirrorNode, variables: BodyVariables): string {
  const keys = variableKeysOf(node);
  if (!keys.length) return '';
  const shown = keys.map((key) =>
    PAGE_VARIABLES.has(key) ? `#${String(variables.digits())}` : variables.text(key),
  );
  return `|${JSON.stringify(shown)}`;
}

// Headers and footers use their own page values for layout.
const REGIONS = new Set(['page_header', 'page_footer']);

// Whether each node's body holds a page variable, kept for as long as the node is.
const pagesHeld = new WeakMap<ProseMirrorNode, boolean>();

/** Whether a node's body or footnote text holds a page's number or the page count. */
export function hasBodyPageVariable(node: ProseMirrorNode): boolean {
  if (REGIONS.has(node.type.name)) return false;
  if (node.isTextblock) return variableKeysOf(node).some((key) => PAGE_VARIABLES.has(key));
  if (node.isLeaf) return false;
  let held = pagesHeld.get(node);
  if (held === undefined) {
    held = false;
    node.forEach((child) => {
      held ||= hasBodyPageVariable(child);
    });
    pagesHeld.set(node, held);
  }
  return held;
}
