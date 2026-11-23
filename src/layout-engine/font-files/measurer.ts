// The font-file measurer as one value: HarfBuzz from the host's wasm bytes, the host's served font
// files, and a factory of Canvas-shaped contexts for Pretext's `setMeasureContext`. Everything
// reaches it as bytes, so it runs the same in a page, a worker or Node, and fetches nothing.

import type { FontFiles, FontShaper } from '../../host/font-files.js';
import type { ReserveCluster } from '../reserved-boxes.js';
import { reserveUnserved } from './cluster-faces.js';
import { createFaceSet, type ServedFace } from './faces.js';
import { createHarfBuzz } from './harfbuzz.js';
import { type FontFaceProblem, readHostFaces } from './host-faces.js';
import {
  createFontFileContext,
  createMeasureProblems,
  type FontFileContext,
  type MeasureProblems,
} from './measure-context.js';
import { readWoff } from './woff.js';

interface FontFileMeasurerOptions {
  /** harfbuzzjs's `harfbuzz.wasm`, as bytes or compiled. */
  readonly wasm: FontShaper;
  /** The served font files, WOFF or OpenType. */
  readonly faces: readonly ServedFace[];
  /** The served family each generic keyword (`monospace`, `serif`) stands for. */
  readonly generics?: Readonly<Record<string, string>>;
}

export interface FontFileMeasurer {
  createContext(): FontFileContext;
  readonly problems: MeasureProblems;
  /**
   * The width a cluster its contexts cannot measure takes (no served face draws it whole), for the
   * layout engine's `reserve` option; null for one they measure (DOCE-PAGINATION-12.4).
   */
  readonly reserve: ReserveCluster;
  /** Bytes of the WebAssembly heap, font data included. */
  heapBytes(): number;
  /**
   * Adds the faces a host served later (DOCE-HOST-1.14), leaving out with a problem each it cannot
   * read; contexts measure with them from their next measure.
   */
  addFiles(files: FontFiles): Promise<readonly FontFaceProblem[]>;
}

const unpacked = (faces: readonly ServedFace[]) =>
  Promise.all(faces.map(async (face) => ({ ...face, bytes: await readWoff(face.bytes) })));

export async function createFontFileMeasurer({
  wasm,
  faces,
  generics,
}: FontFileMeasurerOptions): Promise<FontFileMeasurer> {
  const harfBuzz = await createHarfBuzz(wasm);
  const faceSet = createFaceSet(harfBuzz, await unpacked(faces), generics);
  const problems = createMeasureProblems();
  return {
    createContext: () => createFontFileContext(faceSet, problems),
    problems,
    reserve: reserveUnserved(faceSet),
    heapBytes: () => harfBuzz.heapBytes(),
    async addFiles(files) {
      const read = readHostFaces(files);
      faceSet.add(await unpacked(read.faces), files.generics);
      return read.problems;
    },
  };
}

/**
 * The measurer from what a host serves under Pretext layout: its shaper and its first font files,
 * with a problem for each face it left out.
 */
export async function createHostMeasurer(
  shaper: FontShaper,
  files: FontFiles,
): Promise<{ measurer: FontFileMeasurer; problems: readonly FontFaceProblem[] }> {
  const measurer = await createFontFileMeasurer({ wasm: shaper, faces: [] });
  const problems = await measurer.addFiles(files);
  return { measurer, problems };
}
