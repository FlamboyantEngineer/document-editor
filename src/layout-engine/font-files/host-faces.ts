// The faces a host serves (DOCE-HOST-1.14), checked before HarfBuzz reads them: a face without
// bytes, with a style other than normal or italic, with a weight outside 1 to 1000, or in a format
// the measurer does not read (WOFF2, a collection) is left out with a problem, and nothing throws.

import type { FontFaceFile, FontFiles } from '../../host/font-files.js';
import type { ServedFace } from './faces.js';
import { readWoff } from './woff.js';

/** Why a served face was left out. */
type FontFaceProblemKind = 'empty' | 'style' | 'weight' | 'format';

export interface FontFaceProblem {
  readonly kind: FontFaceProblemKind;
  readonly family: string;
  /** The face's place in the host's list. */
  readonly index: number;
}

const WOFF = 0x774f4646;
const TRUE_TYPE = 0x00010000;
const OPEN_TYPE = 0x4f54544f;
const APPLE_TRUE_TYPE = 0x74727565;
const readable = new Set([WOFF, TRUE_TYPE, OPEN_TYPE, APPLE_TRUE_TYPE]);

function bytesOf(face: FontFaceFile): Uint8Array<ArrayBuffer> | null {
  const { bytes } = face as { bytes: unknown };
  if (bytes instanceof Uint8Array) return bytes as Uint8Array<ArrayBuffer>;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  return null;
}

function problemOf(face: FontFaceFile, bytes: Uint8Array | null): FontFaceProblemKind | null {
  if (!bytes || bytes.byteLength < 4) return 'empty';
  if (face.style !== 'normal' && face.style !== 'italic') return 'style';
  if (!Number.isFinite(face.weight) || face.weight < 1 || face.weight > 1000) return 'weight';
  const signature = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0);
  return readable.has(signature) ? null : 'format';
}

// A usable OpenType face needs bounded table records and the tables that identify its glyphs.
function isOpenType(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signature = view.getUint32(0);
  if (signature === WOFF || !readable.has(signature)) return false;
  const count = view.getUint16(4);
  const end = 12 + 16 * count;
  if (end > bytes.byteLength || !count) return false;
  const required = new Map([
    [0x68656164, 54], // head
    [0x636d6170, 4], // cmap
    [0x6d617870, 6], // maxp
  ]);
  for (let at = 12; at < end; at += 16) {
    const tag = view.getUint32(at);
    const offset = view.getUint32(at + 8);
    const length = view.getUint32(at + 12);
    const minimum = required.get(tag) ?? 0;
    if (length < minimum || (length > 0 && offset < end) || offset + length > bytes.byteLength) {
      return false;
    }
    required.delete(tag);
  }
  return required.size === 0;
}

/** The host's faces the measurer can read, and a problem for each it cannot. */
export async function readHostFaces(files: FontFiles): Promise<{
  faces: ServedFace[];
  problems: FontFaceProblem[];
}> {
  const results = await Promise.all(
    files.faces.map(async (face, index) => {
      const bytes = bytesOf(face);
      const kind = problemOf(face, bytes);
      if (kind || !bytes)
        return { problem: { kind: kind ?? 'empty', family: String(face.family), index } } as const;
      try {
        const unpacked = await readWoff(bytes);
        if (!isOpenType(unpacked)) {
          return { problem: { kind: 'format', family: String(face.family), index } } as const;
        }
        return {
          face: {
            family: face.family,
            weight: face.weight,
            italic: face.style === 'italic',
            bytes: unpacked,
            ...(face.unicodeRange ? { unicodeRange: face.unicodeRange } : {}),
          },
        };
      } catch {
        return { problem: { kind: 'format', family: String(face.family), index } } as const;
      }
    }),
  );
  const faces: ServedFace[] = [];
  const problems: FontFaceProblem[] = [];
  for (const result of results) {
    if (result.problem) problems.push(result.problem);
    else faces.push(result.face);
  }
  return { faces, problems };
}
