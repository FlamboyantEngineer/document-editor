// Everything the pages' layout depends on besides the document, as one key: two machines whose
// keys are equal lay the same document out on the same pages, and two whose keys differ may not
// (DOCE-PAGINATION-13.12). Each input is named, so a difference says which input it is.

import type { FontFaceFile, FontFiles } from '../host/font-files.js';
import { UNICODE_VERSION } from '../layout-engine/bidi-classes.js';
import {
  documentLanguage,
  LAYOUT_RULES,
  type LayoutRules,
  type TemplateFile,
} from '../model/index.js';
import { segmentationFingerprint } from '../utils/segmentation.js';
import type { TextEngineOptions } from './text-engine-types.js';

/** The release of the Pretext fork the engine breaks lines with; a test checks it is installed. */
export const PRETEXT_RELEASE = '1.0.0-fe.7';

/** The release of harfbuzzjs whose glue the measurer shapes through; a test checks it too. */
export const HARFBUZZJS_RELEASE = '1.6.4';

/** The inputs a layout was made from, each as a short key. */
export interface LayoutInputs {
  /** The served faces, by family, weight, style, range and a hash of their bytes. */
  readonly fonts: string;
  /** The family each generic keyword stands for. */
  readonly generics: string;
  readonly pretext: string;
  readonly shaper: string;
  /** The math layouter's own key; empty without one. */
  readonly math: string;
  /** A hash of the resolved template the pages are laid out in. */
  readonly template: string;
  readonly language: string;
  /** How suggestions are shown, which decides the room they take. */
  readonly markup: string;
  /** Which code shows a gutter of line numbers. */
  readonly codeLineNumbers: string;
  /** The runtime's segmentation data (`segmentationFingerprint`) and the bidi data's Unicode. */
  readonly segmentation: string;
  readonly unicode: string;
  /** The node types the host's layout rules size, each with its rule's `sizeKey`. */
  readonly rules: string;
}

// FNV-1a, 32 bits, as eight hex digits, over text or bytes.
function fnv(feed: (step: (unit: number) => void) => void): string {
  let hash = 0x811c9dc5;
  feed((unit) => {
    hash = Math.imul(hash ^ unit, 0x01000193) >>> 0;
  });
  return hash.toString(16).padStart(8, '0');
}

const hashText = (text: string) =>
  fnv((step) => {
    for (let index = 0; index < text.length; index += 1) step(text.charCodeAt(index));
  });

// A face's bytes are hashed once, however many layouts read them.
const faceHashes = new WeakMap<object, string>();

function bytesHash(bytes: ArrayBuffer | Uint8Array<ArrayBuffer>): string {
  const known = faceHashes.get(bytes);
  if (known) return known;
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const hash = fnv((step) => {
    for (const byte of view) step(byte);
  });
  faceHashes.set(bytes, hash);
  return hash;
}

// A template is hashed once for as long as it is kept, however many layouts read it.
const templateHashes = new WeakMap<TemplateFile, string>();

function templateHash(template: TemplateFile): string {
  let hash = templateHashes.get(template);
  if (hash === undefined) {
    hash = hashText(JSON.stringify(template));
    templateHashes.set(template, hash);
  }
  return hash;
}

// The node types a host's rules size and their sizeKeys: what a rule's sizes follow from, the same
// on every machine running the same host code.
function sizedRulesKey(rules: LayoutRules | undefined): string {
  const sized = Object.entries(rules ?? {}).filter(([, rule]) => rule.size);
  const keys = sized.map(([type, rule]) => `${type}=${String(rule.sizeKey ?? '')}`).sort();
  return keys.length ? hashText(keys.join('\n')) : '';
}

const faceKey = (face: FontFaceFile) =>
  [face.family, face.weight, face.style, face.unicodeRange ?? '', bytesHash(face.bytes)].join('|');

/** What a layout's inputs are, from the engine's own. */
export function layoutInputs(input: {
  readonly fonts: FontFiles | null;
  readonly template: TemplateFile;
  readonly language: string;
  readonly markup: string;
  readonly codeLineNumbers: boolean;
  readonly math: string | null;
  readonly rules?: LayoutRules | undefined;
}): LayoutInputs {
  const faces = (input.fonts?.faces ?? []).map(faceKey).sort();
  const generics = Object.entries(input.fonts?.generics ?? {}).sort(([a], [b]) => (a < b ? -1 : 1));
  return {
    fonts: hashText(faces.join('\n')),
    generics: hashText(JSON.stringify(generics)),
    pretext: PRETEXT_RELEASE,
    shaper: `harfbuzzjs-${HARFBUZZJS_RELEASE}`,
    math: input.math ?? '',
    template: templateHash(input.template),
    language: input.language,
    markup: input.markup,
    codeLineNumbers: input.codeLineNumbers ? 'on' : 'off',
    segmentation: segmentationFingerprint(),
    unicode: UNICODE_VERSION,
    rules: sizedRulesKey(input.rules),
  };
}

/** The one key of a layout's inputs: equal for equal inputs, in any runtime. */
export function layoutInputsKey(inputs: LayoutInputs): string {
  const names = Object.keys(inputs).sort() as (keyof LayoutInputs)[];
  return `1-${hashText(names.map((name) => `${name}=${inputs[name]}`).join('\n'))}`;
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
    }),
});
