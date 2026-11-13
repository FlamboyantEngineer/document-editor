// What the writer counts as it writes the body, as the editor's stylesheet counts it: the headings
// of the document's structure, and the objects the template numbers, each scope by its own styles,
// restarting where a section restarts numbering. Captions and equations show these numbers.

import { objectNumberText } from '../../numbering/numbering-text.js';
import {
  NUMBERED_OBJECT_KINDS,
  type NumberedObjectKind,
  type ObjectNumbering,
  type ResolvedNumbering,
  resolveHeadingNumbering,
  resolveObjectNumbering,
} from '../../templates/template-numbering.js';
import { templateScopeStyles } from '../../templates/template-properties.js';
import { sectionRestartsNumbering } from '../../templates/template-scopes.js';
import type { TemplateFile, TemplateSection, TemplateStyles } from '../template-format.js';
import {
  addNumberingScope,
  type NumberingScope,
  restartParagraphs,
  type WordNumbering,
} from './numbering.js';

/** The numbering of the section being written, its counters and its Word numbers. */
export interface Counting {
  styles: TemplateStyles;
  headingNumbering: ResolvedNumbering[];
  objectNumbering: Record<NumberedObjectKind, ObjectNumbering>;
  numbers: NumberingScope;
  headings: number[];
  objects: Record<NumberedObjectKind, number>;
  readonly numbering: WordNumbering;
}

const zeroObjects = (): Record<NumberedObjectKind, number> => ({
  figure: 0,
  table: 0,
  codeBlock: 0,
  equation: 0,
});

/** The stored block types the template numbers, by the kind of object each is. */
export const NUMBERED_BLOCKS: Readonly<Record<string, NumberedObjectKind>> = {
  figure: 'figure',
  table: 'table',
  codeBlock: 'codeBlock',
  linkedCode: 'codeBlock',
  mathBlock: 'equation',
};

/**
 * The counting a section starts with: its own scope's numbering, with its counters and Word
 * numbers from 0 when it restarts numbering or is the first, else carried on from the section
 * before.
 */
export function startSectionCounting(
  previous: Counting | null,
  scope: { template: TemplateFile; section: TemplateSection | null },
  numbering: WordNumbering,
): Counting {
  const restart = !previous || sectionRestartsNumbering(scope.section);
  const styles = templateScopeStyles(scope.template, scope.section);
  const objectNumbering = Object.fromEntries(
    NUMBERED_OBJECT_KINDS.map((kind) => [kind, resolveObjectNumbering(styles, kind)]),
  ) as Record<NumberedObjectKind, ObjectNumbering>;
  return {
    styles,
    headingNumbering: resolveHeadingNumbering(styles),
    objectNumbering,
    numbers: restart ? addNumberingScope(numbering, styles) : previous.numbers,
    headings: restart ? [0, 0, 0, 0, 0, 0] : previous.headings,
    objects: restart ? zeroObjects() : previous.objects,
    numbering,
  };
}

/** Counts a heading of the document's structure at a level, from 1. */
export function countHeading(counting: Counting, level: number): void {
  counting.headings[level - 1] = (counting.headings[level - 1] ?? 0) + 1;
  counting.headings.fill(0, level);
  for (const kind of NUMBERED_OBJECT_KINDS) {
    if (counting.objectNumbering[kind].restartLevel === level) counting.objects[kind] = 0;
  }
  restartParagraphs(counting.numbering, counting.numbers);
}

/**
 * Counts an object the template numbers and gives its number as its label shows it, such as
 * `Table 1.2`; empty when the template does not number its kind.
 */
export function countObject(counting: Counting, kind: NumberedObjectKind): string {
  counting.objects[kind] += 1;
  const numbering = counting.objectNumbering[kind];
  if (!numbering.config.levels.length) return '';
  return objectNumberText(
    numbering.config,
    { count: counting.objects[kind], headingCounters: counting.headings },
    {
      prefix: numbering.prefix,
      suffix: numbering.suffix,
      headingNumbering: counting.headingNumbering.map((heading) => heading.config),
      captionLabel: kind !== 'equation',
    },
  );
}
