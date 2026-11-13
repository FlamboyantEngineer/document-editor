// The DOM attribute names document nodes and marks share, and the helpers that read and write
// them. Server-safe: these helpers read only the elements they are given.

/** The attributes a rendered element writes, as ProseMirror's array output takes them. */
export type DomAttributes = Record<string, string>;

export const DATA_ID_ATTR = 'data-id';
export const DATA_CONTRIBUTOR_ATTR = 'data-au';
export const DATA_AI_SESSION_ATTR = 'data-ai';
export const SPLIT_PART_INDEX_ATTR = 'data-split-part-index';
export const ORPHANED_LIST_CONTINUATION_ATTR = 'data-orphaned-list-continuation';
export const SUGGESTION_SPLIT_KIND_ATTR = 'data-suggestion-split-kind';
export const SUGGESTION_SPLIT_ID_ATTR = 'data-suggestion-split-id';
export const SUGGESTION_FORMAT_ATTR = 'data-suggestion-format';
export const FORMAT_CHANGE_ATTR = 'data-format-change';
export const PARAGRAPH_LEVEL_ATTR = 'data-paragraph-level';
export const CODE_BLOCK_CONTINUED_ATTR = 'data-code-block-continued';
export const CODE_LINE_START_ATTR = 'data-code-line-start';
export const CODE_CAPTION_TEXT_ATTR = 'data-code-caption-text';
export const TABLE_CAPTION_TEXT_ATTR = 'data-caption-text';
export const TABLE_BORDER_1PX_CLASS = 'table-border-1px';
export const TABLE_BORDER_NONE_CLASS = 'table-border-none';
export const TABLE_BORDER_CLASSES: ReadonlySet<string> = new Set([
  TABLE_BORDER_1PX_CLASS,
  TABLE_BORDER_NONE_CLASS,
]);

// The schemes a link may name. Any other, such as `javascript:`, could run script in the page
// that shows the document when a reader follows the link.
const LINK_SCHEMES: ReadonlySet<string> = new Set(['http', 'https', 'mailto', 'tel']);

/**
 * The address a link may hold, or null: a web, mail or telephone address, a fragment or a relative
 * address. Control characters are removed first, since a browser ignores them when it reads the
 * scheme, so they cannot hide one.
 */
export function safeHref(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const address = value.replaceAll(/\p{Cc}/gu, '').trim();
  const scheme = /^([a-z][\d+.a-z-]*):/i.exec(address)?.[1];
  if (scheme && !LINK_SCHEMES.has(scheme.toLowerCase())) return null;
  return address || null;
}

/** Who wrote an element, from its contributor attribute. */
export function readContributorAuthorAttr(dom: Element): string | null {
  return dom.getAttribute(DATA_CONTRIBUTOR_ATTR) || null;
}

/** Writes who wrote an element and the assistant session that did, when known. */
export function appendContributorAttrs(
  attrs: DomAttributes,
  authorId: unknown,
  aiSessionId: unknown = null,
): DomAttributes {
  if (authorId) attrs[DATA_CONTRIBUTOR_ATTR] = String(authorId);
  if (aiSessionId) attrs[DATA_AI_SESSION_ATTR] = String(aiSessionId);
  return attrs;
}

/** Whether a page region is editable: true, false, or null when it does not say. */
export function parsePageRegionEditable(dom: Element): boolean | null {
  const explicit =
    dom.getAttribute('data-page-region-editable') || dom.getAttribute('contenteditable');
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;
  return null;
}

/** Writes whether a page region is editable, when it says. */
export function appendPageRegionEditableAttrs(
  attrs: DomAttributes,
  editable: unknown,
): DomAttributes {
  if (editable === true || editable === false) {
    attrs['data-page-region-editable'] = String(editable);
    attrs.contenteditable = String(editable);
  }
  return attrs;
}

/** A positive pixel size rounded to thousandths, or the fallback. */
export function parseTemplateAssetImageNumber(
  value: unknown,
  fallback: string | number = '',
): string | number {
  const numeric = Number.parseFloat(String(value || '').replace(/px$/i, ''));
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.round(numeric * 1000) / 1000;
}

/** A template image's alignment: `center`, `right` or `left`. */
export function parseTemplateAssetImageAlignment(value: unknown): 'left' | 'center' | 'right' {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return normalized === 'center' || normalized === 'right' ? normalized : 'left';
}

/** The element's string attribute, or null when it is absent or empty. */
export function attributeOrNull(dom: Element, name: string): string | null {
  return dom.getAttribute(name) || null;
}

/** An element's integer attribute, NaN when it is not a number, or null when it is absent. */
export function integerAttributeOrNull(dom: Element, name: string): number | null {
  if (!dom.hasAttribute(name)) return null;
  return Number.parseInt(dom.getAttribute(name) || '', 10);
}
