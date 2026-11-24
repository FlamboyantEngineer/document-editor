// The labs' fonts host for `textLayout=pretext` (DOCE-HOST-1.14.1): HarfBuzz and the font files in
// `labs/build/fonts/`. The regression templates name Arial, Courier New and the generic serif, which
// the labs serve as Arimo, Cousine and Tinos (as Times New Roman), faces with the same metrics, so
// documents keep their look on every machine; Lab Geist and Lab Geist Mono are Geist's own, and
// MathML is drawn in STIX Two Math, served as Lab STIX Two Math and the generic `math`, so a
// local STIX Two Math never draws instead. A generic keyword is answered with the faces of the
// family it stands for. Every file is fetched once and kept.

import type { FontFaceFile, FontFiles, FontsAdapter } from '../../src/host/index.js';

type Style = 'normal' | 'italic';

// The files of a family's four faces: regular, bold, and their italics.
const faces = (prefix: string) =>
  [400, 700].flatMap((weight) =>
    (['normal', 'italic'] as const).map((style: Style) => ({
      weight,
      style,
      file: `${prefix}-latin-${String(weight)}-${style}.woff`,
    })),
  );

type Families = Readonly<Record<string, ReturnType<typeof faces>>>;

const FAMILIES: Families = {
  arial: faces('arimo'),
  'courier new': faces('cousine'),
  'times new roman': faces('tinos'),
  'lab geist': faces('geist'),
  'lab geist mono': faces('geist-mono'),
  // MathML's face, with the OpenType MATH table its stretchy operators and script sizes read.
  'lab stix two math': [
    { weight: 400, style: 'normal', file: 'stix-two-math-latin-400-normal.woff' },
  ],
};

// Other files under the same families: Cousine for every family, so a host that swaps its fonts,
// or a second surface that draws other files under a family, is told apart (DOCE-PAGINATION-12.7,
// DOCE-PAGINATION-12.8).
const COUSINE_FAMILIES: Families = Object.fromEntries(
  Object.keys(FAMILIES).map((family) => [family, faces('cousine')]),
);

const GENERICS: Readonly<Record<string, string>> = {
  math: 'Lab STIX Two Math',
  monospace: 'Courier New',
  'sans-serif': 'Arial',
  serif: 'Times New Roman',
};

const kept = new Map<string, Promise<ArrayBuffer>>();

function bytesOf(file: string): Promise<ArrayBuffer> {
  let bytes = kept.get(file);
  if (!bytes) {
    bytes = fetch(new URL(`build/fonts/${file}`, document.baseURI)).then((response) => {
      if (!response.ok) throw new Error(`Cannot load ${file}`);
      return response.arrayBuffer();
    });
    kept.set(file, bytes);
  }
  return bytes;
}

const key = (family: string) =>
  family
    .trim()
    .replace(/^["']|["']$/gu, '')
    .toLowerCase();

async function filesOf(families: readonly string[], served: Families): Promise<FontFaceFile[]> {
  const named = families.map((family) => GENERICS[key(family)] ?? family);
  const listed = [...new Set(named)].flatMap((family) =>
    (served[key(family)] ?? []).map((face) => ({ ...face, family })),
  );
  return Promise.all(
    listed.map(async ({ file, ...face }) => ({ ...face, bytes: await bytesOf(file) })),
  );
}

// A fonts host serving `served`, its files `delay` ms after they are asked for, and the generic
// keywords as `generics` says.
function labFonts(served: Families, delay = 0, generics = GENERICS): FontsAdapter {
  const later = () => new Promise((resolve) => setTimeout(resolve, delay));
  return {
    load: (families) => Promise.resolve({ ok: true, value: families }),
    async shaper() {
      return { ok: true, value: await bytesOf('harfbuzz.wasm') };
    },
    async files(families) {
      const files = await filesOf(families, served);
      if (delay) await later();
      return { ok: true, value: { faces: files, generics } };
    },
  };
}

/** The labs' fonts host: the template's faces load at once, and their files serve Pretext. */
export const LAB_FONTS: FontsAdapter = labFonts(FAMILIES);

/** A host serving Cousine's files under every family `LAB_FONTS` serves. */
export const COUSINE_FONTS: FontsAdapter = labFonts(COUSINE_FAMILIES);

/** `LAB_FONTS` without a face for MathML, as a host that serves no math face (DOCE-PAGINATION-12.9). */
export const NO_MATH_FONTS: FontsAdapter = labFonts(
  Object.fromEntries(Object.entries(FAMILIES).filter(([family]) => family !== 'lab stix two math')),
  0,
  Object.fromEntries(Object.entries(GENERICS).filter(([generic]) => generic !== 'math')),
);

/** `LAB_FONTS`, its files a second after they are asked for, as a slow host's. */
export const SLOW_LAB_FONTS: FontsAdapter = labFonts(FAMILIES, 1000);

/** Cousine's files for the families of `fonts`' faces, as another host serves them. */
export async function cousineFiles(fonts: FontFiles): Promise<FontFiles> {
  const files = await filesOf(
    fonts.faces.map((face) => face.family),
    COUSINE_FAMILIES,
  );
  return { ...fonts, faces: files };
}
