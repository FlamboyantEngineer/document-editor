// Which served face draws a grapheme cluster, as Blink's font fallback picks it: the first face in
// the family list that draws the cluster whole, with emoji presentation selectors reordering the
// color faces. A cluster no face draws whole is drawn by the browser from a system font, so it
// takes a reserved width (DOCE-PAGINATION-12.4).

import { type ReserveCluster, UNSERVED_CLUSTER_EMS } from '../reserved-boxes.js';
import { type FaceSet, type MatchedFace, parseFont } from './faces.js';

/** Default ignorables Blink gives no width (Character::TreatAsZeroWidthSpace). */
export const zeroWidth =
  /^(?:\u034f|[\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff])$/u;

// Characters a face need not have to draw a cluster: the default ignorables above, variation
// selectors and tags, which Blink hides when the face has no glyph for them.
const selectorsAndTags = /^(?:[\ufe00-\ufe0f]|[\u{e0020}-\u{e007f}]|[\u{e0100}-\u{e01ef}])$/u;
const ignorable = {
  test: (character: string) => zeroWidth.test(character) || selectorsAndTags.test(character),
};

function codePointsOf(cluster: string) {
  return [...cluster].flatMap((character) =>
    ignorable.test(character) ? [] : [character.codePointAt(0) ?? 0],
  );
}

// A face draws a character its unicode-range holds and its file has a glyph for.
function hasGlyph({ face, covers }: MatchedFace, code: number) {
  const drawn = code === 0x2028 || code === 0x2029 ? 0x20 : code;
  return covers(drawn) && face.glyphOf(drawn) !== null;
}

// Whether a face draws a whole cluster, as Blink asks: no .notdef once shaped. A face without
// one of the characters can still draw a letter and its accent as one precomposed glyph.
function drawsCluster(matched: MatchedFace, cluster: string, codes: readonly number[]) {
  if (codes.every((code) => hasGlyph(matched, code))) return true;
  if (!codes.every((code) => matched.covers(code))) return false;
  const visible = [...cluster].filter((character) => !ignorable.test(character)).join('');
  const run = matched.face.shape(visible, { features: [], language: null });
  return run.glyphs.length > 0 && run.glyphs.every((glyph) => glyph !== 0);
}

// The faces a cluster may be drawn with, in order: an emoji presentation selector (U+FE0F) puts
// the color faces first, a text presentation selector (U+FE0E) leaves them out (measured in
// Chromium 153: without a selector the family list decides, whatever the emoji's default).
function candidatesFor(cluster: string, faces: readonly MatchedFace[]) {
  if (cluster.includes('\ufe0f'))
    return [...faces.filter(({ face }) => face.color), ...faces.filter(({ face }) => !face.color)];
  if (cluster.includes('\ufe0e')) return faces.filter(({ face }) => !face.color);
  return faces;
}

// The first face that draws a cluster whole; undefined when none does.
function wholeFace(cluster: string, faces: readonly MatchedFace[]) {
  const codes = codePointsOf(cluster);
  return candidatesFor(cluster, faces).find((matched) => drawsCluster(matched, cluster, codes));
}

// The face a cluster is drawn with: the first that draws it whole, else the first that has its
// first character, else the first face's missing glyph. A cluster no face draws whole is drawn by
// the browser from a system font, so its characters the face lacks are recorded as missing and it
// takes its reserved width.
export function faceFor(cluster: string, faces: readonly MatchedFace[], missing: Set<number>) {
  const whole = wholeFace(cluster, faces);
  if (whole) return { face: whole.face, reserved: false };
  const codes = codePointsOf(cluster);
  const candidates = candidatesFor(cluster, faces);
  const first = codes[0] ?? 0x20;
  const partial =
    candidates.find((matched) => hasGlyph(matched, first)) ??
    faces.find((matched) => hasGlyph(matched, first));
  const drawn = partial && candidates.includes(partial) ? partial : null;
  for (const code of codes) if (!drawn || !hasGlyph(drawn, code)) missing.add(code);
  const face = (partial ?? faces[0])?.face;
  return face ? { face, reserved: true } : undefined;
}

/**
 * What the measurer cannot measure over a face set: a cluster no served face draws whole, which
 * takes `UNSERVED_CLUSTER_EMS` of its font size. The contexts measure such a cluster so, and the
 * layout engine finds the same clusters with it.
 */
export function reserveUnserved(faceSet: FaceSet): ReserveCluster {
  let version = faceSet.version;
  const fonts = new Map<string, { faces: readonly MatchedFace[]; size: number } | null>();
  const answers = new Map<string, boolean>();
  return (cluster, font) => {
    // Faces added since, such as a family served later, may draw what none drew before.
    if (version !== faceSet.version) {
      version = faceSet.version;
      fonts.clear();
      answers.clear();
    }
    let matched = fonts.get(font);
    if (matched === undefined) {
      const request = parseFont(font);
      matched = request ? { faces: faceSet.facesFor(request), size: request.size } : null;
      fonts.set(font, matched);
    }
    if (!matched?.faces.length) return null;
    const key = `${font}\u0000${cluster}`;
    let reserved = answers.get(key);
    if (reserved === undefined) {
      reserved = wholeFace(cluster, matched.faces) === undefined;
      answers.set(key, reserved);
    }
    return reserved ? matched.size * UNSERVED_CLUSTER_EMS : null;
  };
}
