// The font-file measurer as one value: HarfBuzz from the host's wasm bytes, the host's served font
// files, and a factory of Canvas-shaped contexts for Pretext's `setMeasureContext`. Everything
// reaches it as bytes, so it runs the same in a page, a worker or Node, and fetches nothing.

import { createFaceSet, type ServedFace } from './faces.js';
import { createHarfBuzz } from './harfbuzz.js';
import {
  createFontFileContext,
  createMeasureProblems,
  type FontFileContext,
  type MeasureProblems,
} from './measure-context.js';
import { readWoff } from './woff.js';

export interface FontFileMeasurerOptions {
  /** The bytes of harfbuzzjs's `harfbuzz.wasm`. */
  readonly wasm: ArrayBuffer | Uint8Array;
  /** The served font files, WOFF or OpenType. */
  readonly faces: readonly ServedFace[];
  /** The served family each generic keyword (`monospace`, `serif`) stands for. */
  readonly generics?: Readonly<Record<string, string>>;
}

export interface FontFileMeasurer {
  createContext(): FontFileContext;
  readonly problems: MeasureProblems;
  /** Bytes of the WebAssembly heap, font data included. */
  heapBytes(): number;
}

export async function createFontFileMeasurer({
  wasm,
  faces,
  generics,
}: FontFileMeasurerOptions): Promise<FontFileMeasurer> {
  const harfBuzz = await createHarfBuzz(wasm);
  const fonts = await Promise.all(
    faces.map(async (face) => ({ ...face, bytes: await readWoff(face.bytes) })),
  );
  const faceSet = createFaceSet(harfBuzz, fonts, generics);
  const problems = createMeasureProblems();
  return {
    createContext: () => createFontFileContext(faceSet, problems),
    problems,
    heapBytes: () => harfBuzz.heapBytes(),
  };
}
