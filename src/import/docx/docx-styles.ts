// What a word processing document's paragraph styles mean in a stored document, by the mapping the
// library's writer uses (`Heading1`, `Title`, `ParagraphLevel2`, `Quote`, `Code`, `Caption`,
// `Custom_<key>`), by Word's built-in style names, and by an outline level a style or its parents
// set. Any other style is read as a plain paragraph.

import { childElement, childElements, childValue, type XmlElement } from '../xml-read.js';

/** What a paragraph style makes a paragraph. */
export type ParagraphRole =
  | { readonly kind: 'heading'; readonly level: number }
  | { readonly kind: 'title' }
  | { readonly kind: 'paragraph'; readonly level: number }
  | { readonly kind: 'quote' }
  | { readonly kind: 'code' }
  | { readonly kind: 'caption' }
  | { readonly kind: 'custom'; readonly key: string; readonly level: number | null }
  /** A style the stored format has no place for, read as a plain paragraph. */
  | { readonly kind: 'other'; readonly name: string };

interface Style {
  readonly id: string;
  readonly name: string;
  readonly basedOn: string | null;
  readonly outline: number | null;
  readonly numPr: XmlElement | null;
}

/** A document's styles, as the roles they give paragraphs. */
export interface DocxStyles {
  readonly roleOf: (styleId: string | null) => ParagraphRole;
  /** The numbering a paragraph style gives, itself or through the styles it is based on. */
  readonly numberingOf: (styleId: string | null) => XmlElement | null;
  /** Whether a character style is one the writer's caption label runs carry. */
  readonly isCaptionLabel: (styleId: string | null) => boolean;
  /** Whether a paragraph style is Word's list paragraph style, which list items carry. */
  readonly isListParagraph: (styleId: string | null) => boolean;
}

const PLAIN: ParagraphRole = { kind: 'paragraph', level: 1 };

// Built-in styles by their lower-case names, which Word keeps whatever the style id.
const NAMED: Readonly<Record<string, ParagraphRole>> = {
  normal: PLAIN,
  title: { kind: 'title' },
  quote: { kind: 'quote' },
  'intense quote': { kind: 'quote' },
  code: { kind: 'code' },
  'html preformatted': { kind: 'code' },
  caption: { kind: 'caption' },
};

// Styles that are plain paragraphs in the stored format: Word's text styles and the writer's own.
const PLAIN_NAMES = new Set([
  'list paragraph',
  'body text',
  'no spacing',
  'footnote text',
  'endnote text',
  'comment text',
  'header',
  'footer',
  'table header',
  'table paragraph',
  'plain text',
]);

function byId(id: string): ParagraphRole | null {
  const heading = /^Heading([1-6])$/.exec(id);
  if (heading) return { kind: 'heading', level: Number(heading[1]) };
  const level = /^ParagraphLevel([2-6])$/.exec(id);
  if (level) return { kind: 'paragraph', level: Number(level[1]) };
  const custom = /^Custom_(.+)$/.exec(id);
  if (custom) return { kind: 'custom', key: custom[1] ?? '', level: null };
  return null;
}

function byName(name: string): ParagraphRole | null {
  const lower = name.toLowerCase();
  const heading = /^heading ([1-6])$/.exec(lower);
  if (heading) return { kind: 'heading', level: Number(heading[1]) };
  if (PLAIN_NAMES.has(lower) || /^list( bullet| number)?( \d)?$/.test(lower)) return PLAIN;
  return NAMED[lower] ?? null;
}

// The heading an outline level a style sets makes, or null.
const outlineRole = (style: Style | undefined): ParagraphRole | null =>
  style?.outline !== null && style?.outline !== undefined && style.outline < 6
    ? { kind: 'heading', level: style.outline + 1 }
    : null;

function stylesOf(root: XmlElement | null): Map<string, Style> {
  const styles = new Map<string, Style>();
  for (const element of childElements(root, 'w:style')) {
    const id = element.attrs['w:styleId'] ?? '';
    const pPr = childElement(element, 'w:pPr');
    const outline = childValue(pPr, 'w:outlineLvl');
    styles.set(id, {
      id,
      name: childValue(element, 'w:name') ?? id,
      basedOn: childValue(element, 'w:basedOn'),
      outline: outline === null ? null : Number(outline),
      numPr: childElement(pPr, 'w:numPr'),
    });
  }
  return styles;
}

/** The roles of a document's styles, from its styles part (none when it has none). */
export function readStyles(root: XmlElement | null): DocxStyles {
  const styles = stylesOf(root);
  const roleOf = (styleId: string | null, depth = 0): ParagraphRole => {
    const style = styleId ? styles.get(styleId) : undefined;
    if (!styleId || depth > 10) return PLAIN;
    const own = byId(styleId) ?? (style ? byName(style.name) : null) ?? outlineRole(style);
    if (own) return own;
    const parent = style?.basedOn ? roleOf(style.basedOn, depth + 1) : null;
    if (parent && parent.kind !== 'paragraph') return parent;
    return { kind: 'other', name: style?.name ?? styleId };
  };
  const numberingOf = (styleId: string | null, depth = 0): XmlElement | null => {
    const style = styleId ? styles.get(styleId) : undefined;
    if (!style || depth > 10) return null;
    return style.numPr ?? numberingOf(style.basedOn, depth + 1);
  };
  return {
    roleOf: (styleId) => roleOf(styleId),
    numberingOf: (styleId) => numberingOf(styleId),
    isCaptionLabel: (styleId) => styleId === 'CaptionLabel',
    isListParagraph: (styleId) =>
      !!styleId &&
      (styleId === 'ListParagraph' || styles.get(styleId)?.name.toLowerCase() === 'list paragraph'),
  };
}
