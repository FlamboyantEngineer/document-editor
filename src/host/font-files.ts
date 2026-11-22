// The font files a host serves for Pretext layout (DOCE-HOST-1.14): the shaper, harfbuzzjs's
// WebAssembly build, and the faces whose files give every text width, so lines break in the same
// places on every machine (DOCE-PAGINATION-12).

/** harfbuzzjs's `harfbuzz.wasm`, as bytes or compiled. */
export type FontShaper = ArrayBuffer | Uint8Array<ArrayBuffer> | WebAssembly.Module;

/** One served face: a static instance of a family at one weight and style. */
export interface FontFaceFile {
  readonly family: string;
  /** From 1 to 1000. */
  readonly weight: number;
  readonly style: 'normal' | 'italic';
  /** The characters the face serves, as CSS `unicode-range` gives them; all when absent. */
  readonly unicodeRange?: string | undefined;
  /** A WOFF 1.0 or OpenType file. WOFF2 is not read. */
  readonly bytes: ArrayBuffer | Uint8Array<ArrayBuffer>;
}

/** The faces of the families the editor asked for. */
export interface FontFiles {
  readonly faces: readonly FontFaceFile[];
  /** The served family a generic keyword (`monospace`, `serif`) stands for. */
  readonly generics?: Readonly<Record<string, string>> | undefined;
}
