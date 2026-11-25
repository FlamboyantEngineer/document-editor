// The template the pages are drawn and laid out in under `textLayout: 'pretext'` with served fonts
// (DOCE-PAGINATION-12.5): a generic family the template names (`Serif`, `monospace`), and the
// paragraph and code fonts it leaves to the stylesheet's generic fallbacks, become the served
// family the host says the keyword stands for. A generic keyword drawn as it is would be whatever
// face the browser picks, which no served file measures.

import type { TemplateFile } from '../model/index.js';
import { firstFamily, splitFontFamilies } from '../model/templates/template-css-values.js';

const GENERICS = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui']);

/** The generic keywords the pages ask the host for, as the stylesheet's fallbacks and templates use them. */
export const PAGE_GENERICS: readonly string[] = ['serif', 'sans-serif', 'monospace'];

const genericOf = (font: string) =>
  font
    .trim()
    .replace(/^["']|["']$/gu, '')
    .toLowerCase();

// A template's value with each font it names as `rename` gives it.
function renamed(value: unknown, rename: (font: string) => string): unknown {
  if (Array.isArray(value)) return value.map((item) => renamed(item, rename));
  if (!value || typeof value !== 'object') return value;
  const entries = Object.entries(value).map(([key, child]) =>
    key === 'font' && typeof child === 'string'
      ? [key, splitFontFamilies(child).map(renameFamily(rename)).join(', ')]
      : [key, renamed(child, rename)],
  );
  return Object.fromEntries(entries);
}

function renameFamily(rename: (font: string) => string) {
  return (font: string) => {
    const name = rename(font);
    return name !== font && name.includes(',') ? `"${name}"` : name;
  };
}

/**
 * The template with each family it names as `rename` gives it, such as the family a surface draws
 * a served family under (DOCE-PAGINATION-12.8).
 */
export function renameTemplateFonts(
  template: TemplateFile,
  rename: (font: string) => string,
): TemplateFile {
  return renamed(template, rename) as TemplateFile;
}

function served(template: TemplateFile, families: Readonly<Record<string, string>>): TemplateFile {
  return renameTemplateFonts(template, (font) => {
    const generic = genericOf(font);
    return GENERICS.has(generic) ? (families[generic] ?? font) : font;
  });
}

/**
 * The template with each generic family it names, and its unset paragraph and code fonts, as the
 * served family `families` names for the keyword; the template itself when none is served.
 */
export function servedTemplate(
  template: TemplateFile,
  families: Readonly<Record<string, string>>,
): TemplateFile {
  if (!Object.keys(families).length) return template;
  const drawn = served(template, families);
  const styles = drawn.styles ?? {};
  const paragraph = families.serif && !styles.paragraph?.font;
  const code = families.monospace && !styles.codeBlock?.font;
  if (!paragraph && !code) return drawn;
  return {
    ...drawn,
    styles: {
      ...styles,
      ...(paragraph ? { paragraph: { ...styles.paragraph, font: families.serif } } : {}),
      ...(code ? { codeBlock: { ...styles.codeBlock, font: families.monospace } } : {}),
    },
  };
}

// A template's value with each font stack whose first family `isServed` refuses as `fallback`,
// the refused families added to `unserved`.
function withServed(
  value: unknown,
  at: { isServed: (family: string) => boolean; fallback: string; unserved: Set<string> },
): unknown {
  if (Array.isArray(value)) return value.map((item) => withServed(item, at));
  if (!value || typeof value !== 'object') return value;
  const entries = Object.entries(value).map(([key, child]) => {
    if (key !== 'font' || typeof child !== 'string') return [key, withServed(child, at)];
    const first = firstFamily(child);
    if (!first || at.isServed(first)) return [key, child];
    at.unserved.add(first);
    return [key, at.fallback];
  });
  return Object.fromEntries(entries);
}

/**
 * The template with each font whose first family no host file serves as `fallback`, the served
 * body family, so the engine and every drawing of the pages lay it out and draw it alike, and the
 * browser never picks a local font of that name (DOCE-PAGINATION-12.5); and those families.
 */
export function servedFamiliesOnly(
  template: TemplateFile,
  { isServed, fallback }: { isServed: (family: string) => boolean; fallback: string },
): { readonly template: TemplateFile; readonly unserved: readonly string[] } {
  const unserved = new Set<string>();
  const drawn = withServed(template, { isServed, fallback, unserved }) as TemplateFile;
  return unserved.size ? { template: drawn, unserved: [...unserved] } : { template, unserved: [] };
}
