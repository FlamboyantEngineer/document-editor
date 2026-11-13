// A template's JSON text, read back into a template: checked as a template (`validateTemplateFile`)
// and with the keys the host locks taken from the template it holds, so the text can never change
// them.

import { type TemplateFile, validateTemplateFile } from '../../model/index.js';

/** The keys the JSON editor keeps unless the host names others: the format and the id. */
export const LOCKED_TEMPLATE_KEYS: readonly (keyof TemplateFile)[] = ['formatVersion', 'id'];

/** A template's text as the JSON editor shows it. */
export const templateText = (template: TemplateFile) => JSON.stringify(template, null, 2);

/** What a text reads as: a template, or the errors that keep it from being one. */
export type TemplateTextReading =
  | { readonly template: TemplateFile; readonly errors?: never }
  | { readonly errors: readonly string[]; readonly template?: never };

/** How a text is read as a template. */
export interface TemplateTextOptions {
  /** The template the host holds, whose locked keys the text cannot change. */
  readonly held: TemplateFile;
  readonly locked: readonly (keyof TemplateFile)[];
  /** The error of a text that cannot be parsed. */
  readonly notJson: string;
}

/**
 * The template a text reads as, with each locked key's value, or its absence, taken from `held`;
 * or its errors: `notJson` when it cannot be parsed, the template's own otherwise.
 */
export function readTemplateText(
  text: string,
  { held, locked, notJson }: TemplateTextOptions,
): TemplateTextReading {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { errors: [notJson] };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { errors: validateTemplateFile(parsed) };
  }
  const record: Record<string, unknown> = { ...(parsed as Record<string, unknown>) };
  for (const key of locked) {
    if (key in held) record[key] = held[key];
    else delete record[key];
  }
  const errors = validateTemplateFile(record);
  return errors.length ? { errors } : { template: record as unknown as TemplateFile };
}
