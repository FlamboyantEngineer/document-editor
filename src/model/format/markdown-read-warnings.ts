// The Markdown reader's warnings in their source order (DOCE-IMPORT-4.2). The reader meets a
// footnote's definition where it is first cited, which may be far from where it is written, so
// each warning is kept with the source line being read and the warnings are given in line order.

import type { ImportWarningCode, ImportWarnings } from '../../import/import-warnings.js';

/** Warnings gathered with the source line each was met on. */
export interface SourceWarnings {
  readonly add: (code: ImportWarningCode, detail?: string) => void;
  /** The source line now being read; `null` keeps the current one. */
  readonly at: (line: number | null | undefined) => number;
  /** The warnings, in source order and, on one line, in the order they were met. */
  readonly giveTo: (warnings: ImportWarnings) => void;
}

/** An empty set of source-ordered warnings, reading from the first line. */
export function createSourceWarnings(): SourceWarnings {
  const met: { line: number; code: ImportWarningCode; detail: string | undefined }[] = [];
  let current = 0;
  return {
    add: (code, detail) => met.push({ line: current, code, detail }),
    at: (line) => {
      const before = current;
      if (typeof line === 'number') current = line;
      return before;
    },
    giveTo: (warnings) => {
      for (const { code, detail } of [...met].sort((a, b) => a.line - b.line))
        warnings.add(code, detail);
    },
  };
}
