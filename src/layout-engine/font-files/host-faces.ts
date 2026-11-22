// The faces a host serves (DOCE-HOST-1.14), checked before HarfBuzz reads them: a face without
// bytes, with a style other than normal or italic, with a weight outside 1 to 1000, or in a format
// the measurer does not read (WOFF2, a collection) is left out with a problem, and nothing throws.

import type { FontFaceFile, FontFiles } from '../../host/font-files.js';
import type { ServedFace } from './faces.js';

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

/** The host's faces the measurer can read, and a problem for each it cannot. */
export function readHostFaces(files: FontFiles): {
  faces: ServedFace[];
  problems: FontFaceProblem[];
} {
  const faces: ServedFace[] = [];
  const problems: FontFaceProblem[] = [];
  files.faces.forEach((face, index) => {
    const bytes = bytesOf(face);
    const kind = problemOf(face, bytes);
    if (kind || !bytes) {
      problems.push({ kind: kind ?? 'empty', family: String(face.family), index });
      return;
    }
    faces.push({
      family: face.family,
      weight: face.weight,
      italic: face.style === 'italic',
      bytes,
      ...(face.unicodeRange ? { unicodeRange: face.unicodeRange } : {}),
    });
  });
  return { faces, problems };
}
