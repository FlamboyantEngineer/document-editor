import type { FontFaceFile } from '../host/font-files.js';
import { bytesHash } from './bytes-hash.js';

const genericFamilies = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
]);

/** A CSS family name without surrounding quotes. */
export const unquoteFamily = (family: string) => family.trim().replace(/^["']|["']$/gu, '');

/** A family's key, as CSS matches family names. */
export const familyKey = (family: string) => unquoteFamily(family).toLowerCase();

/** Whether a normalized name is a supported generic family. */
export const isGenericFamily = (key: string) => genericFamilies.has(key);

/** Identifies the same file and descriptors when an adapter serves them more than once. */
export function fontFaceKey({ family, weight, style, unicodeRange, bytes }: FontFaceFile): string {
  return JSON.stringify([
    familyKey(family),
    weight,
    style,
    unicodeRange || undefined,
    bytesHash(bytes),
  ]);
}

/** Groups faces by family, keeping exact duplicates in their last position within the family. */
export function uniqueFontFaces<T extends { readonly family: string }>(
  faces: readonly T[],
  keyOf: (face: T) => string,
): T[] {
  const families = new Map<string, Map<string, T>>();
  for (const face of faces) {
    const family = familyKey(face.family);
    const unique = families.get(family) ?? new Map<string, T>();
    const key = keyOf(face);
    unique.delete(key);
    unique.set(key, face);
    families.set(family, unique);
  }
  return [...families.values()].flatMap((unique) => [...unique.values()]);
}

/** A generic keeps the first valid mapping supplied for its name. */
export function addFontGenerics(
  generics: Record<string, string>,
  more: Readonly<Record<string, string>>,
  isServed: (family: string) => boolean,
): boolean {
  let changed = false;
  for (const [keyword, family] of Object.entries(more)) {
    const key = familyKey(keyword);
    if (isGenericFamily(key) && !Object.hasOwn(generics, key) && isServed(familyKey(family))) {
      generics[key] = family;
      changed = true;
    }
  }
  return changed;
}
