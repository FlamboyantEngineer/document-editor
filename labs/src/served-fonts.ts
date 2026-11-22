// The labs' fonts host for `textLayout=pretext` (DOCE-HOST-1.14.1): HarfBuzz and the font files in
// `labs/build/fonts/`. The regression templates name Arial, Courier New and the generic serif, which
// the labs serve as Arimo, Cousine and Tinos (as Times New Roman), faces with the same metrics, so
// documents keep their look on every machine; Lab Geist and Lab Geist Mono are Geist's own. A
// generic keyword is answered with the faces of the family it stands for. Every file is fetched
// once and kept.

import type { FontFaceFile, FontsAdapter } from '../../src/host/index.js';

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

const FAMILIES: Readonly<Record<string, ReturnType<typeof faces>>> = {
  arial: faces('arimo'),
  'courier new': faces('cousine'),
  'times new roman': faces('tinos'),
  'lab geist': faces('geist'),
  'lab geist mono': faces('geist-mono'),
};

const GENERICS: Readonly<Record<string, string>> = {
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

async function filesOf(families: readonly string[]): Promise<FontFaceFile[]> {
  const named = families.map((family) => GENERICS[key(family)] ?? family);
  const listed = [...new Set(named)].flatMap((family) =>
    (FAMILIES[key(family)] ?? []).map((face) => ({ ...face, family })),
  );
  return Promise.all(
    listed.map(async ({ file, ...face }) => ({ ...face, bytes: await bytesOf(file) })),
  );
}

/** The labs' fonts host: the template's faces load at once, and their files serve Pretext. */
export const LAB_FONTS: FontsAdapter = {
  load: (families) => Promise.resolve({ ok: true, value: families }),
  async shaper() {
    return { ok: true, value: await bytesOf('harfbuzz.wasm') };
  },
  async files(families) {
    const served = await filesOf(families);
    return {
      ok: true,
      value: { faces: served, generics: GENERICS },
    };
  },
};
