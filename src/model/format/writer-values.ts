// The values a writer resolves as it writes a stored document, which the stored document names but
// does not hold: a variable's text, such as a document property, and an asset's address. A writer
// runs without the editor, so the host passes these in.

import type { StoredNode } from './document-format.js';

/** An asset a stored document names: a figure's or an image's, at a revision. */
export interface WriterAsset {
  readonly id: string;
  readonly revision?: string | undefined;
}

/** The values a writer resolves; one it does not resolve keeps a placeholder. */
export interface WriterValues {
  /** A variable's text, such as `document.title`'s; null or undefined for none. */
  readonly variable?: ((key: string) => string | null | undefined) | undefined;
  /** The address an asset is read from; null or undefined for none. */
  readonly asset?: ((asset: WriterAsset) => string | null | undefined) | undefined;
}

const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** A stored variable's text: its value, or its key in double braces when it has none. */
export function variableText(node: StoredNode, values: WriterValues = {}): string {
  const key = text(node.attrs?.key);
  return values.variable?.(key) ?? `{{${key}}}`;
}

/**
 * The address of a stored figure's or image's picture: its asset's, when it names one the host
 * resolves, else its own `src`; empty for none.
 */
export function assetAddress(node: StoredNode, values: WriterValues = {}): string {
  const id = text(node.attrs?.assetId);
  const revision = text(node.attrs?.assetRevision) || undefined;
  const resolved = id ? values.asset?.({ id, revision }) : null;
  return resolved ?? text(node.attrs?.src);
}
