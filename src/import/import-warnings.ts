// What a reader left out or changed as it brought a document in, gathered by kind so a host shows
// one line per kind with how often it happened, rather than one line per element.

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
  | 'part-unreadable';

/** One kind of change, what it applied to, and how many times it happened. */
export interface ImportWarning {
  readonly code: ImportWarningCode;
  /** What it applied to, such as the element or style name; empty when the kind says it all. */
  readonly detail: string;
  readonly count: number;
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
    list: () => [...counts.values()].map((warning) => ({ ...warning })),
  };
}
