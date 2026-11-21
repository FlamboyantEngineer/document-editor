// HarfBuzz shaping in WebAssembly, instantiated from bytes the host hands over (no fetch here), and
// the few calls a width measurer needs: a face from a font file's bytes, its nominal glyphs and
// advances in font units, and a shaped run's glyphs, clusters and advances in font units.
// harfbuzzjs's wasm build needs five imports from its Emscripten runtime; they are given here, so
// its JavaScript glue (which fetches the wasm from its own URL) is not loaded.

/** A shaped run: per glyph, its id, its cluster (offset into the text) and its advance in font units. */
export interface ShapedRun {
  readonly glyphs: Uint32Array;
  readonly clusters: Uint32Array;
  readonly advances: Int32Array;
}

export interface GlyphExtents {
  readonly bearing: number;
  readonly width: number;
}

export interface ShapeOptions {
  /** OpenType features in HarfBuzz's syntax, such as `-kern`. */
  readonly features: readonly string[];
  /** BCP 47 language of the text, or null for none. */
  readonly language: string | null;
}

/** One font file, unscaled: every number is in font units. */
export interface HarfBuzzFace {
  readonly unitsPerEm: number;
  glyphOf(codePoint: number): number | null;
  advanceOf(glyph: number): number;
  extentsOf(glyph: number): GlyphExtents;
  shape(text: string, options: ShapeOptions): ShapedRun;
}

export interface HarfBuzz {
  createFace(bytes: ArrayBuffer | Uint8Array<ArrayBuffer>): HarfBuzzFace;
  /** Bytes of the WebAssembly heap, which faces' font data live in. */
  heapBytes(): number;
}

type Pointer = number;
interface Exports {
  readonly memory: WebAssembly.Memory;
  malloc(size: number): Pointer;
  free(pointer: Pointer): void;
  __wasm_call_ctors?: () => void;
  hb_blob_create(
    data: Pointer,
    length: number,
    mode: number,
    user: Pointer,
    destroy: Pointer,
  ): Pointer;
  hb_face_create(blob: Pointer, index: number): Pointer;
  hb_face_get_upem(face: Pointer): number;
  hb_font_create(face: Pointer): Pointer;
  hb_font_get_nominal_glyph(font: Pointer, codePoint: number, glyph: Pointer): number;
  hb_font_get_glyph_h_advance(font: Pointer, glyph: number): number;
  hb_font_get_glyph_extents(font: Pointer, glyph: number, extents: Pointer): number;
  hb_buffer_create(): Pointer;
  hb_buffer_clear_contents(buffer: Pointer): void;
  hb_buffer_add_utf16(
    buffer: Pointer,
    text: Pointer,
    length: number,
    offset: number,
    count: number,
  ): void;
  hb_buffer_set_language(buffer: Pointer, language: Pointer): void;
  hb_language_from_string(text: Pointer, length: number): Pointer;
  hb_buffer_guess_segment_properties(buffer: Pointer): void;
  hb_buffer_get_length(buffer: Pointer): number;
  hb_buffer_get_glyph_infos(buffer: Pointer, length: Pointer): Pointer;
  hb_buffer_get_glyph_positions(buffer: Pointer, length: Pointer): Pointer;
  hb_feature_from_string(text: Pointer, length: number, feature: Pointer): number;
  hb_shape(font: Pointer, buffer: Pointer, features: Pointer, count: number): void;
}

const READ_ONLY = 1;
const FEATURE_BYTES = 16;
const MAX_FEATURES = 16;
const WASM_PAGE = 65_536;

/** Instantiates HarfBuzz from the bytes of harfbuzzjs's `harfbuzz.wasm`. */
export async function createHarfBuzz(
  wasm: ArrayBuffer | Uint8Array<ArrayBuffer>,
): Promise<HarfBuzz> {
  // Filled once the module exists; the module asks to grow its heap only while it runs.
  const heap: { memory?: WebAssembly.Memory } = {};
  const env = {
    _emscripten_runtime_keepalive_clear: () => undefined,
    _abort_js: () => {
      throw new Error('HarfBuzz aborted');
    },
    _setitimer_js: () => 0,
    emscripten_resize_heap: (size: number) => {
      const { memory } = heap;
      if (!memory) return 0;
      memory.grow(Math.ceil((size - memory.buffer.byteLength) / WASM_PAGE));
      return 1;
    },
  };
  const proc_exit = (code: number) => {
    throw new Error(`HarfBuzz exited with ${String(code)}`);
  };
  const source = wasm instanceof Uint8Array ? wasm : new Uint8Array(wasm);
  const { instance } = await WebAssembly.instantiate(source, {
    env,
    wasi_snapshot_preview1: { proc_exit },
  });
  const native = instance.exports as unknown as Exports;
  heap.memory = native.memory;
  native.__wasm_call_ctors?.();
  return bindHarfBuzz(native);
}

function bindHarfBuzz(native: Exports): HarfBuzz {
  // The heap can grow on any call, which detaches earlier views, so each read takes a fresh one.
  const u8 = () => new Uint8Array(native.memory.buffer);
  const u16 = () => new Uint16Array(native.memory.buffer);
  const i32 = () => new Int32Array(native.memory.buffer);
  const u32 = () => new Uint32Array(native.memory.buffer);
  const buffer = native.hb_buffer_create();
  const features = native.malloc(FEATURE_BYTES * MAX_FEATURES);
  const scratch = native.malloc(16);
  const languages = new Map<string, Pointer>();
  const featureSets = new Map<string, number>();

  function cString(text: string): Pointer {
    const bytes = new TextEncoder().encode(text);
    const pointer = native.malloc(bytes.length + 1);
    u8().set(bytes, pointer);
    u8()[pointer + bytes.length] = 0;
    return pointer;
  }
  function languageOf(tag: string): Pointer {
    let language = languages.get(tag);
    if (language === undefined) {
      const text = cString(tag);
      language = native.hb_language_from_string(text, -1);
      native.free(text);
      languages.set(tag, language);
    }
    return language;
  }
  // The features are written into one shared array, rewritten when the set changes.
  let written = '';
  function writeFeatures(list: readonly string[]): number {
    const key = list.join(',');
    if (key === written) return featureSets.get(key) ?? 0;
    list.slice(0, MAX_FEATURES).forEach((feature, index) => {
      const text = cString(feature);
      native.hb_feature_from_string(text, -1, features + index * FEATURE_BYTES);
      native.free(text);
    });
    written = key;
    featureSets.set(key, Math.min(list.length, MAX_FEATURES));
    return Math.min(list.length, MAX_FEATURES);
  }
  function fill(text: string, language: string | null) {
    native.hb_buffer_clear_contents(buffer);
    const pointer = native.malloc(text.length * 2 + 2);
    const units = u16();
    for (let index = 0; index < text.length; index += 1)
      units[pointer / 2 + index] = text.charCodeAt(index);
    native.hb_buffer_add_utf16(buffer, pointer, text.length, 0, text.length);
    native.free(pointer);
    if (language) native.hb_buffer_set_language(buffer, languageOf(language));
    native.hb_buffer_guess_segment_properties(buffer);
  }
  function readRun(): ShapedRun {
    const length = native.hb_buffer_get_length(buffer);
    const infos = native.hb_buffer_get_glyph_infos(buffer, 0) / 4;
    const positions = native.hb_buffer_get_glyph_positions(buffer, 0) / 4;
    const words = u32();
    const signed = i32();
    const glyphs = new Uint32Array(length);
    const clusters = new Uint32Array(length);
    const advances = new Int32Array(length);
    for (let index = 0; index < length; index += 1) {
      glyphs[index] = words[infos + index * 5] ?? 0;
      clusters[index] = words[infos + index * 5 + 2] ?? 0;
      advances[index] = signed[positions + index * 5] ?? 0;
    }
    return { glyphs, clusters, advances };
  }

  function createFace(bytes: ArrayBuffer | Uint8Array<ArrayBuffer>): HarfBuzzFace {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const pointer = native.malloc(data.byteLength);
    u8().set(data, pointer);
    const blob = native.hb_blob_create(pointer, data.byteLength, READ_ONLY, 0, 0);
    const face = native.hb_face_create(blob, 0);
    const font = native.hb_font_create(face);
    const unitsPerEm = native.hb_face_get_upem(face);
    return {
      unitsPerEm,
      glyphOf: (codePoint) =>
        native.hb_font_get_nominal_glyph(font, codePoint, scratch)
          ? (u32()[scratch / 4] ?? 0)
          : null,
      advanceOf: (glyph) => native.hb_font_get_glyph_h_advance(font, glyph),
      extentsOf: (glyph) => {
        native.hb_font_get_glyph_extents(font, glyph, scratch);
        const values = i32();
        return { bearing: values[scratch / 4] ?? 0, width: values[scratch / 4 + 2] ?? 0 };
      },
      shape: (text, { features: list, language }) => {
        fill(text, language);
        native.hb_shape(font, buffer, features, writeFeatures(list));
        return readRun();
      },
    };
  }

  return { createFace, heapBytes: () => native.memory.buffer.byteLength };
}
