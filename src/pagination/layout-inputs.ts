// The pages' recorded layout inputs besides the document, as one key (DOCE-PAGINATION-13.12).
// Each input is named, so a difference says which input it is.

import type { FontFaceFile, FontFiles } from '../host/font-files.js';
import { UNICODE_VERSION } from '../layout-engine/bidi-classes.js';
import { REFUSED_TEXT_ATOMS } from '../layout-engine/text-atoms.js';
import {
  documentLanguage,
  LAYOUT_RULES,
  type LayoutRules,
  type TemplateFile,
} from '../model/index.js';
import { familyKey, fontFaceKey, uniqueFontFaces } from '../utils/font-keys.js';
import { segmentationFingerprint } from '../utils/segmentation.js';
import { stableKey } from '../utils/stable-key.js';
import { portableTemplateOf } from './served-template.js';
import type { TextEngineOptions } from './text-engine-types.js';

/** The release of the Pretext fork the engine breaks lines with; a test checks it is installed. */
export const PRETEXT_RELEASE = '1.0.0-fe.7';

/** The release of harfbuzzjs whose glue the measurer shapes through; a test checks it too. */
export const HARFBUZZJS_RELEASE = '1.6.4';

/** The inputs a layout was made from, each as a short key. */
export interface LayoutInputs {
  /**
   * The served faces by family, weight, style, range and bytes, without exact duplicates: each
   * family's faces in precedence order, the families by name, and the family served first, which
   * a font none of whose families is served falls back to.
   */
  readonly fonts: string;
  /** The family each generic keyword stands for, by its name as CSS matches it. */
  readonly generics: string;
  readonly pretext: string;
  readonly shaper: string;
  /** The math layouter's own key; empty without one. */
  readonly math: string;
  /** A hash of the resolved template with portable font family names. */
  readonly template: string;
  readonly language: string;
  /** How suggestions are shown, which decides the room they take. */
  readonly markup: string;
  /** Which code shows a gutter of line numbers. */
  readonly codeLineNumbers: string;
  /** The runtime's segmentation data (`segmentationFingerprint`) and the bidi data's Unicode. */
  readonly segmentation: string;
  readonly unicode: string;
  /**
   * The host's layout rules: the types they size, each with its rule's `sizeKey`, and those whose
   * rule keeps the block with a heading, ends the page or splits it.
   */
  readonly rules: string;
  /** The node types the host draws with views of its own, which take no room unless sized. */
  readonly hostViews: string;
  /** The text atoms not laid out as text. */
  readonly refusedTextAtoms: string;
}

// The version of the library's own layout in the key's prefix: moved by hand whenever the same
// inputs lay a document out on other pages, or the key is made otherwise.
const LAYOUT_KEY_VERSION = 4;

// FNV-1a, 32 bits, as eight hex digits, over text or bytes.
function fnv(feed: (step: (unit: number) => void) => void, seed = 0x811c9dc5): string {
  let hash = seed;
  feed((unit) => {
    hash = Math.imul(hash ^ unit, 0x01000193) >>> 0;
  });
  return hash.toString(16).padStart(8, '0');
}

const hashText = (text: string) =>
  fnv((step) => {
    for (let index = 0; index < text.length; index += 1) step(text.charCodeAt(index));
  });

// A template is hashed once for as long as it is kept, however many layouts read it.
const templateHashes = new WeakMap<TemplateFile, string>();

function templateHash(template: TemplateFile): string {
  let hash = templateHashes.get(template);
  if (hash === undefined) {
    hash = hashText(stableKey(template));
    templateHashes.set(template, hash);
  }
  return hash;
}

// What a host's rules lay blocks out by, the same on every machine running the same host code: the
// types they size with their sizeKeys (a function's identity differs by runtime), and the types
// kept with a heading, ending a page or split by a rule of the host's.
function rulesKey(rules: LayoutRules | undefined): string {
  const keys = Object.entries(rules ?? {}).flatMap(([type, rule]) => {
    const parts = [
      rule.size ? `size=${String(rule.sizeKey ?? '')}` : '',
      rule.keepsWithHeading ? 'keepsWithHeading' : '',
      rule.endsPage ? 'endsPage' : '',
      rule.split ? 'split' : '',
    ].filter(Boolean);
    return parts.length ? [`${type}:${parts.join(',')}`] : [];
  });
  return keys.length ? hashText(keys.sort().join('\n')) : '';
}

const namesKey = (names: Iterable<string>) => [...new Set(names)].sort().join(',');

// Only the order of a family's faces and the first family served decide a layout, so faces served
// in another order of families, again, or under another spelling of a family give the same key.
function fontsKey(faces: readonly FontFaceFile[]): string {
  const families = new Map<string, string[]>();
  for (const face of uniqueFontFaces(faces, fontFaceKey)) {
    const family = familyKey(face.family);
    families.set(family, [...(families.get(family) ?? []), fontFaceKey(face)]);
  }
  const fallback = faces[0] ? familyKey(faces[0].family) : '';
  const sorted = [...families].sort(([a], [b]) => (a < b ? -1 : 1));
  return hashText([`fallback=${fallback}`, ...sorted.flatMap(([, keys]) => keys)].join('\n'));
}

/** What a layout's inputs are, from the engine's own. */
export function layoutInputs(input: {
  readonly fonts: FontFiles | null;
  readonly template: TemplateFile;
  readonly language: string;
  readonly markup: string;
  readonly codeLineNumbers: boolean;
  readonly math: string | null;
  readonly rules?: LayoutRules | undefined;
  readonly hostViews?: readonly string[] | undefined;
  readonly refusedTextAtoms?: ReadonlyMap<string, string> | undefined;
}): LayoutInputs {
  const generics = Object.entries(input.fonts?.generics ?? {})
    .map(([keyword, family]): [string, string] => [keyword, familyKey(family)])
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return {
    fonts: fontsKey(input.fonts?.faces ?? []),
    generics: hashText(JSON.stringify(generics)),
    pretext: PRETEXT_RELEASE,
    shaper: `harfbuzzjs-${HARFBUZZJS_RELEASE}`,
    math: input.math ?? '',
    template: templateHash(portableTemplateOf(input.template)),
    language: input.language,
    markup: input.markup,
    codeLineNumbers: input.codeLineNumbers ? 'on' : 'off',
    segmentation: segmentationFingerprint(),
    unicode: UNICODE_VERSION,
    rules: rulesKey(input.rules),
    hostViews: namesKey(input.hostViews ?? []),
    refusedTextAtoms: namesKey((input.refusedTextAtoms ?? REFUSED_TEXT_ATOMS).keys()),
  };
}

/** The one key of a layout's inputs: equal for equal inputs, in any runtime; 64 bits of hash. */
export function layoutInputsKey(inputs: LayoutInputs): string {
  const names = Object.keys(inputs).sort() as (keyof LayoutInputs)[];
  const text = names.map((name) => `${name}=${inputs[name]}`).join('\n');
  const feed = (step: (unit: number) => void) => {
    for (let index = 0; index < text.length; index += 1) step(text.charCodeAt(index));
  };
  return `${String(LAYOUT_KEY_VERSION)}-${fnv(feed)}${fnv(feed, 0x050c5d1f)}`;
}

/** The layout rules the engine sizes nodes by: the host's, else the library's own (`LAYOUT_RULES`). */
export function rulesOf(options: TextEngineOptions): () => LayoutRules {
  return () => options.layoutRules?.() ?? LAYOUT_RULES;
}

/** An engine's template and fonts, and what its layout depends on besides the document. */
export const engineSources = (options: TextEngineOptions) => ({
  template: options.template,
  fonts: options.fonts,
  inputs: () =>
    layoutInputs({
      fonts: options.fonts?.() ?? null,
      template: options.template,
      language: options.language ?? documentLanguage(null, options.template),
      markup: options.markup?.() ?? 'all',
      codeLineNumbers: options.codeLineNumbers ?? false,
      math: options.mathLayouter?.()?.key ?? null,
      rules: rulesOf(options)(),
      hostViews: options.hostViews,
      refusedTextAtoms: options.refusedTextAtoms,
    }),
});
