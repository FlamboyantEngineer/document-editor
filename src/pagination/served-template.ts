// The portable font choices in the template the engine lays pages out with and every surface
// draws them with (DOCE-PAGINATION-12.5). A surface applies its own registered aliases afterward.

import type { FontFiles } from '../host/font-files.js';
import type { TemplateFile } from '../model/index.js';
import { firstFamily, splitFontFamilies } from '../model/templates/template-css-values.js';
import { familyKey, isGenericFamily } from '../utils/font-keys.js';

// The editor's drawn templates keep their resolved source for cross-document layout comparisons.
const portableTemplates = new WeakMap<TemplateFile, TemplateFile>();

/** The generic keywords the pages ask the host for, as the stylesheet's fallbacks and templates use them. */
export const PAGE_GENERICS: readonly string[] = ['serif', 'sans-serif', 'monospace'];

// A served family name as a token in a CSS font stack, preserving a comma in the name.
const fontToken = (family: string) => (family.includes(',') ? `"${family}"` : family);

function replaceFonts(value: unknown, replace: (stack: string) => string): unknown {
  if (Array.isArray(value)) return value.map((item) => replaceFonts(item, replace));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      key === 'font' && typeof child === 'string' ? replace(child) : replaceFonts(child, replace),
    ]),
  );
}

function renameStack(stack: string, rename: (font: string) => string): string {
  return splitFontFamilies(stack)
    .map((font) => {
      const name = rename(font);
      return name === font ? font : fontToken(name);
    })
    .join(', ');
}

/** The template with each served family under the name a surface draws it in (DOCE-PAGINATION-12.8). */
export function renameTemplateFonts(
  template: TemplateFile,
  rename: (font: string) => string,
): TemplateFile {
  return replaceFonts(template, (stack) => renameStack(stack, rename)) as TemplateFile;
}

/** The resolved template before the editor assigned local aliases to its font families. */
export const portableTemplateOf = (template: TemplateFile): TemplateFile =>
  portableTemplates.get(template) ?? template;

/** Gives an editor its local font aliases while retaining the portable source template. */
export function aliasTemplateFonts(
  template: TemplateFile,
  alias: (font: string) => string,
): TemplateFile {
  let changed = false;
  const drawn = renameTemplateFonts(template, (font) => {
    const family = alias(font);
    changed ||= family !== font;
    return family;
  });
  if (!changed) return template;
  portableTemplates.set(drawn, portableTemplateOf(template));
  return drawn;
}

function withDefaultFonts(template: TemplateFile, paragraph: string, code: string): TemplateFile {
  const styles = template.styles ?? {};
  if (styles.paragraph?.font && styles.codeBlock?.font) return template;
  return {
    ...template,
    styles: {
      ...styles,
      ...(!styles.paragraph?.font ? { paragraph: { ...styles.paragraph, font: paragraph } } : {}),
      ...(!styles.codeBlock?.font ? { codeBlock: { ...styles.codeBlock, font: code } } : {}),
    },
  };
}

function withoutRefusedFamilies(
  stack: string,
  refused: ReadonlySet<string>,
  served?: ReadonlySet<string>,
): string {
  const families = splitFontFamilies(stack);
  const remaining = families.filter((family) => !refused.has(familyKey(family)));
  const first = families[0];
  if (!first || !refused.has(familyKey(first)) || !served) return remaining.join(', ');
  const usable = remaining.findIndex((family) => served.has(familyKey(family)));
  return usable < 0 ? '' : remaining.slice(usable).join(', ');
}

/** Resolves template fonts against the supplied files and, for a viewer, excludes refused families. */
export function resolveServedTemplate(
  template: TemplateFile,
  files: FontFiles | null,
  refused?: ReadonlySet<string>,
): { readonly template: TemplateFile; readonly unserved: readonly string[] } {
  const supplied = files?.faces ?? [];
  const faces = refused
    ? supplied.filter((face) => !refused.has(familyKey(face.family)))
    : supplied;
  const first = faces[0];
  if (!first && refused?.size) {
    return {
      template: replaceFonts(template, (stack) =>
        withoutRefusedFamilies(stack, refused),
      ) as TemplateFile,
      unserved: [],
    };
  }
  if (!first) return { template, unserved: [] };
  const served = new Set(faces.map((face) => familyKey(face.family)));
  const generics = files?.generics ?? {};
  const resolveGeneric = (font: string) => {
    const key = familyKey(font);
    return isGenericFamily(key) ? (generics[key] ?? font) : font;
  };
  const availableStack = (stack: string) => {
    const resolved = renameStack(stack, resolveGeneric);
    return refused?.size ? withoutRefusedFamilies(resolved, refused, served) : resolved;
  };
  const body = firstFamily(availableStack(template.styles?.paragraph?.font ?? ''));
  const fallback = fontToken(
    [body, ...PAGE_GENERICS.map((generic) => generics[generic])].find(
      (family) => family && served.has(familyKey(family)),
    ) ?? first.family,
  );
  const unserved = new Set<string>();
  const drawn = replaceFonts(template, (stack) => {
    const resolved = availableStack(stack);
    const family = firstFamily(resolved);
    const requested = firstFamily(stack);
    if (served.has(familyKey(family)) || (!family && !requested)) return resolved;
    unserved.add(requested);
    return fallback;
  }) as TemplateFile;
  const defaultFont = (key: string) => {
    const family = generics[key];
    return family && served.has(familyKey(family)) ? fontToken(family) : fallback;
  };
  return {
    template: withDefaultFonts(drawn, defaultFont('serif'), defaultFont('monospace')),
    unserved: [...unserved],
  };
}
