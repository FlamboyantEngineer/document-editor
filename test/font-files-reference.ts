// The reference text the determinism checks measure (the forced-lines spike's 275 strings per
// font: seven texts and their words at five sizes), the served faces they are measured in, and a
// fingerprint of the widths, so that a machine that measures differently can be told apart.

export interface ReferenceFace {
  readonly family: string;
  readonly weight: number;
  readonly italic: boolean;
  /** Path of the WOFF file under the served font directory. */
  readonly file: string;
}

export const REFERENCE_FACES: readonly ReferenceFace[] = [
  { family: 'Lab Geist', weight: 400, italic: false, file: 'geist-latin-400-normal.woff' },
  { family: 'Lab Geist', weight: 700, italic: false, file: 'geist-latin-700-normal.woff' },
  { family: 'Lab Geist', weight: 400, italic: true, file: 'geist-latin-400-italic.woff' },
  { family: 'Lab Geist', weight: 700, italic: true, file: 'geist-latin-700-italic.woff' },
  {
    family: 'Lab Geist Mono',
    weight: 400,
    italic: false,
    file: 'geist-mono-latin-400-normal.woff',
  },
  { family: 'Lab KaTeX Main', weight: 400, italic: false, file: 'KaTeX_Main-Regular.woff' },
  { family: 'Lab KaTeX Main', weight: 700, italic: false, file: 'KaTeX_Main-Bold.woff' },
  { family: 'Lab KaTeX Main', weight: 400, italic: true, file: 'KaTeX_Main-Italic.woff' },
  { family: 'Lab KaTeX Sans', weight: 400, italic: false, file: 'KaTeX_SansSerif-Regular.woff' },
];

export const REFERENCE_SIZES = [11, 12, 13.333333, 16, 21.5];

const texts = [
  'The quick brown fox jumps over the lazy dog.',
  'AVA FAA NASA To Ty Yo LT PA Wa',
  'Sphinx of black quartz, judge my vow; 0123456789 (1/64) — “quoted” text…',
  'Pagination splits paragraphs at line starts the engine computed beforehand',
  'iiiiiiiiii llllllllll mmmmmmmmmm WWWWWWWWWW',
  ' ',
  'fi fl ffi office affluent',
];

/** The texts and their words: 55 strings, measured at each size. */
export const REFERENCE_STRINGS = [
  ...texts,
  ...texts.flatMap((text) => text.split(' ')).filter(Boolean),
];

/** Something that measures like Canvas: a 2D context or a font-file context. */
export interface Measurer {
  font: string;
  measureText(text: string): { readonly width: number };
}

const fontOf = (face: ReferenceFace, size: number) =>
  `${face.italic ? 'italic ' : ''}${String(face.weight)} ${String(size)}px "${face.family}"`;

/** Every reference width, keyed `<font>|<text>`. */
export function measureReference(measurer: Measurer): Record<string, number> {
  const widths: Record<string, number> = {};
  for (const face of REFERENCE_FACES) {
    for (const size of REFERENCE_SIZES) {
      const font = fontOf(face, size);
      measurer.font = font;
      for (const text of REFERENCE_STRINGS)
        widths[`${font}|${text}`] = measurer.measureText(text).width;
    }
  }
  return widths;
}

/** A short fingerprint of the widths: FNV-1a over each key and the width's float64 bits. */
export function fingerprintWidths(widths: Readonly<Record<string, number>>): string {
  let hash = 0x811c9dc5;
  const bits = new DataView(new ArrayBuffer(8));
  const mix = (byte: number) => {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  };
  for (const key of Object.keys(widths).sort()) {
    for (const unit of key) mix(unit.charCodeAt(0) & 0xff);
    bits.setFloat64(0, widths[key] ?? 0);
    for (let index = 0; index < 8; index += 1) mix(bits.getUint8(index));
  }
  return hash.toString(16).padStart(8, '0');
}
