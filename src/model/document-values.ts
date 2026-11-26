// What a document stores beside its content that its pages are laid out with: the language its
// text is broken into lines in, and the text of each variable it shows other than a page's number
// and the page count, as last refreshed (DOCE-FORMAT-1.7). Both are the top node's attributes, so
// they are saved, shared and versioned with the document; a value changes only by an edit.

import type { Node as ProseMirrorNode } from 'prosemirror-model';

/** The text of each variable a document shows, by its key, such as `document.name`. */
export type DocumentValues = Readonly<Record<string, string>>;

/** The language a document is laid out in when neither it nor its template names one. */
export const FALLBACK_LANGUAGE = 'en';

/** The variables whose value comes from the layout: a page's number and the page count. */
export const LAYOUT_VARIABLES: ReadonlySet<string> = new Set(['page.current', 'page.total']);

const NO_VALUES: DocumentValues = Object.freeze({});

/** Whether a value is a record of variable texts. */
export function isDocumentValues(value: unknown): value is DocumentValues {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every((text) => typeof text === 'string');
}

/** A language tag in its canonical form, such as `en-GB`; null for none or one that is not a tag. */
export function canonicalLanguage(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return Intl.getCanonicalLocales(value.trim())[0] ?? null;
  } catch {
    return null;
  }
}

/** A document's own language, null when it names none. */
export function ownLanguage(doc: ProseMirrorNode): string | null {
  return canonicalLanguage(doc.attrs.language);
}

/**
 * The language a document's pages are laid out in: its own, else its template's, else `en`; never
 * the host page's, so every host breaks its lines alike.
 */
export function documentLanguage(
  doc: ProseMirrorNode | null | undefined,
  template?: { readonly language?: string | null | undefined } | null,
): string {
  return (
    (doc ? ownLanguage(doc) : null) ?? canonicalLanguage(template?.language) ?? FALLBACK_LANGUAGE
  );
}

/** The variable texts a document stores. */
export function storedValues(doc: ProseMirrorNode): DocumentValues {
  const values: unknown = doc.attrs.values;
  return isDocumentValues(values) ? values : NO_VALUES;
}

/** The text a document stores for a variable; empty for none. */
export function storedValue(doc: ProseMirrorNode, key: string): string {
  return storedValues(doc)[key] ?? '';
}
