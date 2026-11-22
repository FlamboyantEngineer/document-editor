// The Pretext lab's fonts. By default the template's families (Arial and Courier New) come from
// the system. With `?fonts=served` the lab serves Geist and Geist Mono itself, to the page and to
// the prediction worker, so the browser and Pretext draw from the same files; with
// `&measurer=font-files` Pretext's widths come from those files, shaped with HarfBuzz
// (font-widths spike, DOCE-LABS-7), instead of from Canvas. With `&scripts` it also serves the Noto
// subsets of test/fixtures/fonts/ after them in each family list, for the script closeness checks
// (DOCE-LABS-7.3). The worker reads the same query from
// its name, since it has no page address.

import type { ServedFace } from '../../../../src/layout-engine/font-files/faces.js';

export type LabMeasurer = 'canvas' | 'font-files';

/** The faces the lab serves from `labs/build/fonts/`, under the families the template is given. */
export interface LabFace {
  readonly family: string;
  readonly weight: number;
  readonly italic: boolean;
  readonly file: string;
}

export const SANS_FAMILY = 'Lab Geist';
export const MONO_FAMILY = 'Lab Geist Mono';

export const LAB_FACES: readonly LabFace[] = [400, 700].flatMap((weight) =>
  [false, true].flatMap((italic) => {
    const style = italic ? 'italic' : 'normal';
    return [
      { family: SANS_FAMILY, weight, italic, file: `geist-latin-${String(weight)}-${style}.woff` },
      {
        family: MONO_FAMILY,
        weight,
        italic,
        file: `geist-mono-latin-${String(weight)}-${style}.woff`,
      },
    ];
  }),
);

const query = new URLSearchParams(
  typeof document === 'undefined'
    ? (globalThis as { name?: string }).name
    : globalThis.location.search,
);

/** Whether the lab serves the script fonts after its own. */
export const servesScripts = query.has('scripts');
/** Whether the lab serves its fonts. Font-file widths and the script fonts imply it. */
export const servesFonts =
  query.get('fonts') === 'served' || query.get('measurer') === 'font-files' || servesScripts;
/** The script families, in the order each family list names them after the lab's own. */
export const SCRIPT_FAMILIES = [
  'Lab Noto Arabic',
  'Lab Noto Hebrew',
  'Lab Noto Devanagari',
  'Lab Noto Thai',
  'Lab Noto SC',
  'Lab Noto Symbols 2',
  'Lab Noto Color Emoji',
];
export const labMeasurer: LabMeasurer =
  query.get('measurer') === 'font-files' ? 'font-files' : 'canvas';
/** The query the prediction worker is named with, so it reads the same settings. */
export const workerName = `fonts=${servesFonts ? 'served' : 'system'}&measurer=${labMeasurer}${
  servesScripts ? '&scripts' : ''
}`;

/** What the page hands the worker: the served font files, and HarfBuzz for font-file widths. */
export interface FontSetup {
  readonly faces: readonly ServedFace[];
  readonly wasm: ArrayBuffer | null;
}

let setup: Promise<FontSetup> | undefined;

async function bytesOf(path: string) {
  const response = await fetch(new URL(path, document.baseURI));
  if (!response.ok) throw new Error(`Cannot load ${path}`);
  return response.arrayBuffer();
}

// The script faces, listed with their unicode-range in build/fonts/scripts/faces.json.
async function scriptFaces(): Promise<(LabFace & { unicodeRange?: string })[]> {
  if (!servesScripts) return [];
  const response = await fetch(new URL('build/fonts/scripts/faces.json', document.baseURI));
  const faces = (await response.json()) as (LabFace & { unicodeRange?: string })[];
  return faces.map((face) => ({ ...face, file: `scripts/${face.file}` }));
}

/** The served files, fetched once by the page (the host); nothing in the measurer fetches. */
export function loadFontSetup(): Promise<FontSetup> {
  setup ??= Promise.all([
    scriptFaces().then((scripts) =>
      Promise.all(
        [...LAB_FACES, ...scripts].map(async ({ file, ...face }) => ({
          ...face,
          bytes: await bytesOf(`build/fonts/${file}`),
        })),
      ),
    ),
    labMeasurer === 'font-files' ? bytesOf('build/fonts/harfbuzz.wasm') : Promise.resolve(null),
  ]).then(([faces, wasm]) => ({ faces, wasm }));
  return setup;
}

/** Adds the served faces to a font set, the page's or the worker's, and waits for them. */
export async function addServedFaces(fonts: FontFaceSet, faces: readonly ServedFace[]) {
  for (const { family, weight, italic, bytes, unicodeRange } of faces) {
    const face = new FontFace(family, bytes, {
      weight: String(weight),
      style: italic ? 'italic' : 'normal',
      ...(unicodeRange ? { unicodeRange } : {}),
    });
    fonts.add(await face.load());
  }
}
