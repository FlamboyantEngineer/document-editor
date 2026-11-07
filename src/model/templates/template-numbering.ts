// How a template scope numbers its headings and its captioned objects: each one's format, its
// prefix and suffix, and for an object how many heading levels its number counts. The stylesheet's
// counter content and the text a list of contents shows are both built from these.

import type { NumberingSettings, TemplateStyles } from '../format/template-format.js';
import { buildDisabledNumberingStyle } from '../numbering/document-numbering.js';
import { type NumberingStyleConfig, parseNumberingStyle } from '../numbering/numbering-format.js';

/** A heading level's or an object's resolved numbering. */
export interface ResolvedNumbering {
  readonly config: NumberingStyleConfig;
  readonly prefix: string;
  readonly suffix: string;
}

/** The kinds of captioned object a document numbers. */
export type NumberedObjectKind = 'figure' | 'table' | 'codeBlock' | 'equation';

/** An object kind's numbering, and the heading level whose start restarts its count. */
export interface ObjectNumbering extends ResolvedNumbering {
  /** The heading level that restarts the count: as deep as the levels the number counts; or null. */
  readonly restartLevel: number | null;
}

export const NUMBERED_OBJECT_KINDS: readonly NumberedObjectKind[] = [
  'figure',
  'table',
  'codeBlock',
  'equation',
];

function configOf(numbering: NumberingSettings | null | undefined): NumberingStyleConfig {
  const format = numbering?.format?.trim();
  return format ? parseNumberingStyle(format) : buildDisabledNumberingStyle();
}

function resolved(numbering: NumberingSettings | null | undefined): ResolvedNumbering {
  return {
    config: configOf(numbering),
    prefix: numbering?.prefix ?? '',
    suffix: numbering?.suffix ?? '',
  };
}

/** Each heading level's numbering, from level 1 to 6. */
export function resolveHeadingNumbering(styles: TemplateStyles): ResolvedNumbering[] {
  return ([1, 2, 3, 4, 5, 6] as const).map((level) =>
    resolved(styles[`heading${level}`]?.numbering),
  );
}

// An equation's number sits inside its wrapper, so a prefix or suffix that repeats it drops it.
function equationNumbering(styles: TemplateStyles): ResolvedNumbering {
  const equation = styles.equation;
  const wrapper = equation?.wrapper ?? '()';
  const open = wrapper.slice(0, 1);
  const close = wrapper.length > 1 ? wrapper.slice(-1) : '';
  const { config, prefix, suffix } = resolved(equation?.numbering);
  const inner = {
    prefix: open && prefix.startsWith(open) ? prefix.slice(1) : prefix,
    suffix: close && suffix.endsWith(close) ? suffix.slice(0, -1) : suffix,
  };
  return { config, prefix: open + inner.prefix, suffix: inner.suffix + close };
}

/** An object kind's numbering. */
export function resolveObjectNumbering(
  styles: TemplateStyles,
  kind: NumberedObjectKind,
): ObjectNumbering {
  const numbering =
    kind === 'equation' ? equationNumbering(styles) : resolved(styles[kind]?.numbering);
  const depth = Math.max(0, numbering.config.levels.length - 1);
  return { ...numbering, restartLevel: depth >= 1 && depth <= 6 ? depth : null };
}
