// A text block's direction, from its text alone (DOCE-PAGINATION-9.11): its first strongly
// directional character decides it, as Unicode's paragraph rule (UAX #9, P2 and P3) and the
// browser's `dir="auto"` do, read in its text and the text its mentions and glossary references
// show. A block without one is left to right. Lines break in the text's order whatever its
// direction, so the engine's lines hold in both; the pages draw a block with its `dir`, so the
// browser never decides it from other text, such as an equation's letters.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { abbreviationDisplayText } from '../model/glossary.js';
import { mentionPresentation } from '../model/schema/inline-atom-nodes.js';

/** Which way a block's lines run. */
export type TextDirection = 'ltr' | 'rtl';

// Letters of the scripts written right to left (Bidi_Class R or AL), and the marks that are
// strongly right to left without being letters: the Hebrew maqaf, paseq, sof pasuq and nun
// hafukha, the Arabic signs and punctuation of class AL, and the right-to-left mark.
const RIGHT_TO_LEFT =
  /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\p{Script=Adlam}\p{Script=Hanifi_Rohingya}\p{Script=Mende_Kikakui}\p{Script=Imperial_Aramaic}\p{Script=Phoenician}\p{Script=Kharoshthi}\p{Script=Old_South_Arabian}\p{Script=Avestan}\p{Script=Yezidi}]/u;
const STRONG_RTL_MARKS = /[\u05BE\u05C0\u05C3\u05C6\u0608\u060B\u060D\u061B-\u061F\u06D4\u200F]/u;
// Characters of no class but their letters' own: a letter, a spacing mark or the left-to-right mark.
const LETTER = /[\p{L}\p{Mc}\u200E]/u;

function directionOf(character: string): TextDirection | null {
  if (STRONG_RTL_MARKS.test(character)) return 'rtl';
  if (!LETTER.test(character)) return null;
  return RIGHT_TO_LEFT.test(character) ? 'rtl' : 'ltr';
}

// The text an inline node shows: a text node's, a mention's `@name`, a glossary reference's.
function shownText(node: ProseMirrorNode): string {
  if (node.isText) return node.text ?? '';
  if (node.type.name === 'mention') {
    const person = { id: String(node.attrs.userId || ''), label: String(node.attrs.label || '') };
    return mentionPresentation(person, { mentionClass: '' }).text;
  }
  if (node.type.name === 'abbreviation_reference') return abbreviationDisplayText(node.attrs);
  return '';
}

// The direction of a run of text, or null when no character in it decides one.
function textDirection(text: string): TextDirection | null {
  for (const character of text) {
    const direction = directionOf(character);
    if (direction) return direction;
  }
  return null;
}

const directions = new WeakMap<ProseMirrorNode, TextDirection>();

/** A text block's direction, left to right when nothing in its text decides it. */
export function blockDirection(block: ProseMirrorNode): TextDirection {
  let direction = directions.get(block);
  if (direction) return direction;
  direction = 'ltr';
  for (let index = 0; index < block.childCount; index += 1) {
    const found = textDirection(shownText(block.child(index)));
    if (found) {
      direction = found;
      break;
    }
  }
  directions.set(block, direction);
  return direction;
}
