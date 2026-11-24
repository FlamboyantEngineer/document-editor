// The template variables of the pages' body text, for the text layout engine (DOCE-PAGINATION-11.13):
// what each shows, as the page variables draw it, the key a kept layout of a block holding some
// must match, and whether a document's body holds a page variable, whose box's digits settle
// with the page count as a list of contents' page boxes do.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type BodyVariables, PAGE_VARIABLES } from '../layout-engine/body-variables.js';
import { fixedVariableText, type PageVariablesOptions } from './page-variables.js';

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

/** What the body text's variables show, from the page variables' values and the page boxes' digits. */
export function bodyVariablesOf(
  values: PageVariablesOptions | undefined,
  digits: () => number,
): BodyVariables {
  return { text: (key) => fixedVariableText(key, values ?? {}) ?? '', digits };
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

// The page regions, whose variables are laid out with their page's own values.
const REGIONS = new Set(['page_header', 'page_footer', 'page_footnotes']);

// Whether each node's body holds a page variable, kept for as long as the node is.
const pagesHeld = new WeakMap<ProseMirrorNode, boolean>();

/** Whether a node's body text, outside its page regions, holds a page's number or the page count. */
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
