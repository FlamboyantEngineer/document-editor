// What a reader left out or changed as it brought a document in, gathered by kind so a host shows
// one line per kind with how often it happened, rather than one line per element. Each kind
// belongs to one group of an import report: content lost or simplified, presentation the template
// applies instead, or Word presentation the template deliberately replaces.

/** The kinds of change a reader reports (DOCE-IMPORT-1.2). */
export type ImportWarningCode =
  /** Content the stored format has no place for, such as raw markup, a text box or a chart. */
  | 'content-left-out'
  /** A style the template does not define, read as plain text of its kind. */
  | 'style-left-out'
  /** Formatting the document stores in its template rather than on text, such as a font or colour. */
  | 'formatting-left-out'
  /** An image the reader could not take in, such as a linked one or one in an unknown format. */
  | 'image-left-out'
  /** An equation kept as its text rather than as math. */
  | 'equation-as-text'
  /** A field whose result was kept as text, such as a date or a cross-reference. */
  | 'field-as-text'
  /** A part of the file that could not be read, such as a broken comment or footnote list. */
  | 'part-unreadable'
  /** A heading deeper than the sixth level, read at the sixth. */
  | 'heading-level-clamped'
  /** A typed number taken off the start of a heading, since the template numbers headings. */
  | 'heading-number-removed'
  /** A caption with nothing to caption beside it, kept as a paragraph. */
  | 'caption-left-out'
  /** Tracked changes accepted, or comments left out, when a reader does not keep review history. */
  | 'review-left-out'
  /** A caption joined to its figure or table, whose number the template now gives. */
  | 'caption-numbered'
  /** A title paragraph read as the document's title, which the template presents. */
  | 'title-applied'
  /** Headings numbered by the document's own numbering, which the template's numbering replaces. */
  | 'heading-numbering-applied'
  /** A table, which takes the template's table style. */
  | 'table-style-applied'
  /** A table of contents, which the template's lists of contents replace. */
  | 'contents-skipped'
  /** A header or footer, which the template's replace when the document is composed. */
  | 'header-footer-skipped'
  /** A section's page size, orientation or margins, which the template's replace. */
  | 'section-layout-skipped';

/** The group of an import report a kind of warning belongs to. */
export type ImportWarningGroup =
  /** Content left out or simplified. */
  | 'not-imported'
  /** Presentation the template applies in place of the document's own. */
  | 'applied'
  /** The document's presentation the template deliberately replaces. */
  | 'skipped';

/** One kind of change, what it applied to, and how many times it happened. */
export interface ImportWarning {
  readonly code: ImportWarningCode;
  /** What it applied to, such as the element or style name; empty when the kind says it all. */
  readonly detail: string;
  readonly count: number;
  /** The report group of its code (`importWarningGroup`). */
  readonly group: ImportWarningGroup;
}

const GROUPS: Readonly<Partial<Record<ImportWarningCode, ImportWarningGroup>>> = {
  'formatting-left-out': 'skipped',
  'contents-skipped': 'skipped',
  'header-footer-skipped': 'skipped',
  'section-layout-skipped': 'skipped',
  'caption-numbered': 'applied',
  'title-applied': 'applied',
  'heading-numbering-applied': 'applied',
  'table-style-applied': 'applied',
};

/**
 * The report group a warning code belongs to; a code no group names, such as a host's own, is
 * content not imported, so a loss is never shown as a deliberate skip.
 */
export function importWarningGroup(code: string): ImportWarningGroup {
  return GROUPS[code as ImportWarningCode] ?? 'not-imported';
}

/** Gathers warnings, one per code and detail, counting repeats. */
export interface ImportWarnings {
  readonly add: (code: ImportWarningCode, detail?: string) => void;
  /** The warnings so far, in the order each first happened. */
  readonly list: () => ImportWarning[];
}

/** An empty set of warnings to gather into. */
export function createImportWarnings(): ImportWarnings {
  const counts = new Map<string, { code: ImportWarningCode; detail: string; count: number }>();
  return {
    add: (code, detail = '') => {
      const key = `${code}\u0000${detail}`;
      const known = counts.get(key);
      if (known) known.count += 1;
      else counts.set(key, { code, detail, count: 1 });
    },
    list: () =>
      [...counts.values()].map((warning) => ({
        ...warning,
        group: importWarningGroup(warning.code),
      })),
  };
}
