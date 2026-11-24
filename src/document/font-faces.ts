// The served faces a document's pages were measured and drawn with (DOCE-HOST-1.14.1), as the
// `@font-face` rules of a static render: the same bytes, inlined, under the families the template
// names, so a print or a PDF draws its text in the faces its lines were broken in and never in a
// local font of that name (DOCE-PAGINATION-13.8).

import type { FontFaceFile, FontFiles } from '../host/font-files.js';
import { encodeBase64 } from '../utils/base64.js';

// A value as a CSS string.
const cssString = (value: string) => `"${value.replace(/["\\]/gu, (char) => `\\${char}`)}"`;

// A face's media type, from its signature: WOFF 1.0, or an OpenType or TrueType file.
function mediaType(bytes: Uint8Array): string {
  const signature = String.fromCharCode(...bytes.subarray(0, 4));
  if (signature === 'wOFF') return 'font/woff';
  return signature === 'OTTO' ? 'font/otf' : 'font/ttf';
}

function faceRule(face: FontFaceFile): string {
  const bytes = face.bytes instanceof Uint8Array ? face.bytes : new Uint8Array(face.bytes);
  const declarations = [
    `font-family: ${cssString(face.family)}`,
    `src: url(data:${mediaType(bytes)};base64,${encodeBase64(bytes)})`,
    `font-weight: ${String(face.weight)}`,
    `font-style: ${face.style}`,
    ...(face.unicodeRange ? [`unicode-range: ${face.unicodeRange}`] : []),
    'font-display: block',
  ];
  return `@font-face { ${declarations.join('; ')}; }`;
}

/** Each served face as an `@font-face` rule holding its file; none without served fonts. */
export function fontFaceRules(fonts: FontFiles | null | undefined): string {
  return (fonts?.faces ?? []).map(faceRule).join(' ');
}
