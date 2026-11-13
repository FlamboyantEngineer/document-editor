// What the Markdown writer carries while it writes a document: how it writes the suggestions, the
// values it shows, and the footnotes it has cited so far.

import type { StoredNode } from '../document-format.js';
import type { SuggestionsMode } from '../left-out.js';

/** The values a Markdown document shows for the references a stored document holds. */
export interface MarkdownValues {
  /** A variable's text, such as `document.title`'s; a variable without one is written as `{{key}}`. */
  readonly variable?: ((key: string) => string | null | undefined) | undefined;
  /** The address of an asset a figure or image stores by id, at its revision when it has one. */
  readonly asset?:
    | ((asset: { readonly id: string; readonly revision?: string }) => string | null | undefined)
    | undefined;
}

export interface Writing {
  readonly suggestions: SuggestionsMode;
  readonly values: MarkdownValues;
  /** The footnotes' definitions, in the order cited. */
  readonly footnotes: string[];
  /** Whether a table's cell is being written, where a pipe ends the cell even in code. */
  readonly inTable?: boolean;
}

/** A stored value as text: a string as it is, anything else as none. */
export const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** The address of a figure or image: its own, or its asset's, as the host gives it. */
export function addressOf(node: StoredNode, writing: Writing): string {
  const { src, assetId, assetRevision } = node.attrs ?? {};
  if (text(src)) return text(src);
  const id = text(assetId);
  if (!id) return '';
  const revision = text(assetRevision);
  return writing.values.asset?.(revision ? { id, revision } : { id }) ?? '';
}
