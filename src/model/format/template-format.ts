// The stored template format. A template is JSON a host stores as it likes; the library reads,
// validates, merges and resolves it. Every setting is optional, since a template inherits what it
// does not set from its parent, and the base template sets everything.
//
// Inheritance is one rule: a setting that is absent or null takes the parent's value, and any other
// value, an empty string included, is the template's own. Objects merge setting by setting; lists
// replace the parent's list whole.

import type { StoredContent } from './document-format.js';

/** The current template format version. */
export const TEMPLATE_FORMAT_VERSION = 1;

/** A CSS length with its unit, such as `12pt`, `25.4mm` or `0.5in`. */
export type Length = string;

/** A hex color, such as `#1f2937`. */
export type Color = string;

/** The page sizes a template may name. */
export type PageSizeName =
  | `A${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10}`
  | 'US Letter'
  | 'US Legal'
  | 'US Tabloid'
  | 'US Ledger'
  | 'US Executive'
  | 'US Statement'
  | 'US Junior Legal'
  | 'US Half-Letter'
  | 'US Government Letter'
  | 'US Government Legal';

export type TextAlignment = 'left' | 'center' | 'right' | 'justify';

/** A box's four sides. */
export interface Sides<T> {
  top?: T | null;
  right?: T | null;
  bottom?: T | null;
  left?: T | null;
}

/** The page a scope lays out on. */
export interface PageSettings {
  size?: PageSizeName | null;
  orientation?: 'portrait' | 'landscape' | null;
  margins?: Sides<Length> | null;
}

/** Font settings. */
export interface FontSettings {
  font?: string | null;
  size?: Length | null;
  /** A CSS font weight, such as `400` or `700`. */
  weight?: number | null;
  italic?: boolean | null;
  underline?: boolean | null;
  color?: Color | null;
}

/** A block of text's settings. */
export interface TextSettings extends FontSettings {
  /** A multiple of the font size. */
  lineHeight?: number | null;
  alignment?: TextAlignment | null;
  spaceBefore?: Length | null;
  spaceAfter?: Length | null;
}

/**
 * A numbering format (DOCE-NUMBERING-1), such as `1.1` or `A-1`, with text before and after the
 * number. An empty format numbers nothing.
 */
export interface NumberingSettings {
  /** Whether the numbering shows; false keeps the format while numbering nothing. */
  enabled?: boolean | null;
  format?: string | null;
  prefix?: string | null;
  suffix?: string | null;
}

/** A heading level's settings. */
export interface HeadingSettings extends TextSettings {
  numbering?: NumberingSettings | null;
}

/** One paragraph numbering level's format and indentation. */
export interface ParagraphLevelSettings {
  format?: string | null;
  /** Where the number starts, from the content edge. */
  numberIndent?: Length | null;
  /** Where the text starts, from the content edge. */
  textIndent?: Length | null;
}

/** Paragraph settings. */
export interface ParagraphSettings extends TextSettings {
  numbering?: (NumberingSettings & { levels?: (ParagraphLevelSettings | null)[] | null }) | null;
  /** Indentation of every line, after the space a number takes. */
  indentation?: Length | null;
}

/** The markers a bulleted list may name; any other bullet is the text it shows. */
export type BulletKeyword = 'disc' | 'circle' | 'square' | 'none';

/** List settings. */
export interface ListSettings {
  /** A bulleted list's marker: a `BulletKeyword`, or up to 8 characters of text, such as `–`. */
  bullet?: string | null;
  /** The numbering format of a numbered list. */
  format?: string | null;
  /** The text before a numbered list's number. */
  prefix?: string | null;
  /** The text after a numbered list's number and its separator. */
  suffix?: string | null;
  indentation?: Length | null;
  spaceBefore?: Length | null;
  spaceAfter?: Length | null;
}

/** A caption's settings. */
export interface CaptionSettings {
  placement?: 'above' | 'below' | null;
  alignment?: 'left' | 'center' | 'right' | null;
  /** The text after a continued caption, on the later parts of a split object. */
  continuedSuffix?: string | null;
  /** The label's font: the object's name, number and separator. Unset values take the text's. */
  label?: FontSettings | null;
  /** The caption text's font. Unset values take the paragraph's. */
  text?: FontSettings | null;
}

/** A numbered, captioned object's settings. */
export interface CaptionedObjectSettings {
  numbering?: NumberingSettings | null;
  caption?: CaptionSettings | null;
}

/** Table settings. */
export interface TableSettings extends CaptionedObjectSettings {
  border?: { width?: Length | null; color?: Color | null } | null;
  cellPadding?: Length | null;
  header?: { background?: Color | null; color?: Color | null; weight?: number | null } | null;
  /** The background of odd and even body rows. */
  rows?: { odd?: Color | null; even?: Color | null } | null;
  /** Whether the later parts of a split table repeat its header rows and caption. */
  repeatHeader?: boolean | null;
}

/** Figure settings. */
export interface FigureSettings extends CaptionedObjectSettings {
  /** The width a new figure is inserted at. */
  defaultWidth?: Length | null;
}

/** Code block settings. */
export interface CodeBlockSettings extends CaptionedObjectSettings, TextSettings {
  background?: Color | null;
}

/** Equation settings. */
export interface EquationSettings extends CaptionedObjectSettings {
  /** The characters around an equation's number, such as `()`; empty for none. */
  wrapper?: string | null;
}

/** The characters between a list entry and its page number. */
export interface ContentsLeader {
  /** The character repeated; empty for no leader. */
  character?: string | null;
  /** The space between the characters. */
  spacing?: Length | null;
}

/** A list level's indentation, spacing and leader. */
export interface ContentsLevelSettings {
  indentation?: Length | null;
  spaceBefore?: Length | null;
  spaceAfter?: Length | null;
  leader?: ContentsLeader | null;
}

/** One kind of list's own settings, over the lists' settings. */
export interface ContentsKindSettings {
  /** The title the list shows. */
  title?: string | null;
  leader?: Pick<ContentsLeader, 'character'> | null;
  /** Each level's own leader, merged by index over the lists' levels. */
  levels?: ({ leader?: Pick<ContentsLeader, 'character'> | null } | null)[] | null;
}

/** The settings of generated lists, such as a table of contents. */
export interface ContentsSettings {
  title?: FontSettings | null;
  entry?: FontSettings | null;
  padding?: Sides<Length> | null;
  spacing?: Sides<Length> | null;
  leader?: ContentsLeader | null;
  /** Each level's indentation, spacing and leader, merged by index when inherited. */
  levels?: (ContentsLevelSettings | null)[] | null;
  /** Each kind of list's own settings, by its key (`toc`, `figures` and the host's kinds). */
  kinds?: Record<string, ContentsKindSettings | null> | null;
}

/** The styles of a scope. */
export interface TemplateStyles {
  paragraph?: ParagraphSettings | null;
  title?: TextSettings | null;
  heading1?: HeadingSettings | null;
  heading2?: HeadingSettings | null;
  heading3?: HeadingSettings | null;
  heading4?: HeadingSettings | null;
  heading5?: HeadingSettings | null;
  heading6?: HeadingSettings | null;
  list?: ListSettings | null;
  table?: TableSettings | null;
  figure?: FigureSettings | null;
  codeBlock?: CodeBlockSettings | null;
  equation?: EquationSettings | null;
  contents?: ContentsSettings | null;
  /** Styles a writer applies by name, keyed by a name `CUSTOM_STYLE_NAME` accepts. */
  custom?: Record<string, TextSettings> | null;
}

/** A page header or footer. */
export interface RegionSettings {
  /** Its content. Variables such as `page.current` stay live. */
  content?: StoredContent | null;
  height?: Length | null;
  spacingToContent?: Length | null;
  /**
   * Whether the region takes the enclosing scope's region: a template's, its parent's; a section's,
   * the template's. Its own content is kept, so switching this off restores it.
   */
  inherit?: boolean | null;
}

/** Footnote settings. */
export interface FootnoteSettings {
  /** Whether footnotes are numbered through the document or on each page. Document-level only. */
  numbering?: 'document' | 'page' | null;
  /** The text after a footnote's number in the footnote area, not in the text. */
  suffix?: string | null;
  separator?: { enabled?: boolean | null; thickness?: Length | null; color?: Color | null } | null;
  spacingToContent?: Length | null;
  entrySpacing?: Length | null;
  marker?: FontSettings | null;
  text?: TextSettings | null;
}

/** Reference settings, keyed by format key (DOCE-SCHEMA-4.1). */
export interface ReferenceSettings {
  /** Each format key's format, with `ref.*` and `doc.*` tokens. */
  formats?: Record<string, string | null> | null;
  /** Whether each format key's references show as links. */
  links?: Record<string, boolean | null> | null;
}

/** The margin bars that mark changes. */
export interface ChangeBarSettings {
  insertions?: { enabled?: boolean | null; color?: Color | null } | null;
  deletions?: { enabled?: boolean | null; color?: Color | null } | null;
  modifications?: { enabled?: boolean | null; color?: Color | null } | null;
  formatting?: { enabled?: boolean | null; color?: Color | null } | null;
  side?: 'left' | 'right' | null;
  offset?: Length | null;
  width?: Length | null;
}

/** A section a template defines. */
export interface TemplateSection {
  /** The section's name: lower-case letters, digits and underscores, unique in the template. */
  name: string;
  /** The name a reader sees. */
  label?: string | null;
  /** Whether every document has the section. */
  required?: boolean | null;
  /** Whether a writer may edit its content. */
  editable?: boolean | null;
  /** Whether a writer may add or remove it. */
  insertable?: boolean | null;
  /** The content a new section starts with, or, when it is not editable, always has. */
  content?: StoredContent | null;
  /** The content an empty section shows until a writer adds some. */
  placeholder?: StoredContent | null;
  /** Whether heading and paragraph numbering restarts at the section. Unset: when it sets styles. */
  restartNumbering?: boolean | null;
  page?: PageSettings | null;
  styles?: TemplateStyles | null;
  header?: RegionSettings | null;
  footer?: RegionSettings | null;
  footnotes?: Omit<FootnoteSettings, 'numbering'> | null;
  /** The section's own change bars, over the document's. */
  changeBars?: ChangeBarSettings | null;
}

/** A stored template. */
export interface TemplateFile {
  formatVersion: typeof TEMPLATE_FORMAT_VERSION;
  /** The template's id: letters, digits, underscores and hyphens. */
  id: string;
  name?: string | null;
  /** The id of the template it inherits from. Without one it inherits the base template. */
  parent?: string | null;
  page?: PageSettings | null;
  styles?: TemplateStyles | null;
  header?: RegionSettings | null;
  footer?: RegionSettings | null;
  footnotes?: FootnoteSettings | null;
  references?: ReferenceSettings | null;
  changeBars?: ChangeBarSettings | null;
  /** The sections, in document order. A template's list replaces its parent's. */
  sections?: TemplateSection[] | null;
  /**
   * The host's own settings, keyed by the host's name for them, inherited like the rest. A keyed
   * collection is a record, so a template overrides one entry; `extensionRecord` reads it.
   */
  extensions?: Record<string, unknown> | null;
}
