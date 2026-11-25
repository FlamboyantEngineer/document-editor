// A signature's box, worked out from the node before it is drawn (DOCE-PAGINATION-14.3): its
// strokes' drawing over the signer's name, on a line to sign on, the name in the font of the
// template's paragraphs, as wide as the drawing or the name, whichever is wider.

import { normalizeSignatureVector } from '../signature-vector.js';
import type { RuleSize, SizeInput } from './page-layout.js';

/** The box a signature's strokes are drawn in, scaled to fit its `viewBox`. */
export const SIGNATURE_DRAWING = { width: 120, height: 48 } as const;

/** The rule a signature is signed on, below its name. */
export const SIGNATURE_RULE = 1;

/** A signature's box: on its line's baseline at its bottom, the rule to sign on included. */
export function signatureSize({ node, text }: SizeInput): RuleSize {
  const name = String(node.attrs.displayName ?? '');
  // One line of the name, or of a letter for a signature with none, at any width it fits in.
  const line = text.lines(name || 'x', { width: 1e6 }).height;
  const signed = normalizeSignatureVector(node.attrs.vector) !== null;
  const height = (signed ? SIGNATURE_DRAWING.height : 0) + line + SIGNATURE_RULE;
  const width = Math.max(SIGNATURE_DRAWING.width, name ? text.width(name) : 0);
  return { width, height, baseline: height };
}
