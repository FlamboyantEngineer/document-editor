// A text block's direction, from its text alone (DOCE-PAGINATION-9.12): its first strongly
// directional character decides it, by its Bidi_Class (L, or R and AL, from
// the generated table of bidi-classes.ts), as Unicode's paragraph rule (UAX #9, P2 and P3) and the
// browser's `dir="auto"` do, read in its text and the text its mentions and glossary references
// show. A block without one is left to right. Lines break in the text's order whatever its
// direction, so the engine's lines hold in both; the pages draw a block with its `dir`, so the
// browser never decides it from other text, such as an equation's letters.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { abbreviationDisplayText } from '../model/glossary.js';
import { mentionPresentation } from '../model/schema/inline-atom-nodes.js';
import { STRONG_RUNS } from './bidi-classes.js';

/** Which way a block's lines run. */
export type TextDirection = 'ltr' | 'rtl';

// Each run of the table's code points and its strong direction, read once: where it starts and
// its direction, 0 for none, 1 left to right and 2 right to left.
let runs: { readonly starts: Uint32Array; readonly kinds: Uint8Array } | null = null;
const KINDS: Record<string, number> = { N: 0, L: 1, R: 2 };

function readRuns() {
  const parts = STRONG_RUNS.match(/[LRN][0-9a-z]+/gu) ?? [];
  const starts = new Uint32Array(parts.length);
  const kinds = new Uint8Array(parts.length);
  let at = 0;
  parts.forEach((part, index) => {
    starts[index] = at;
    kinds[index] = KINDS[part.charAt(0)] ?? 0;
    at += parseInt(part.slice(1), 36);
  });
  return { starts, kinds };
}

/**
 * A code point's strong direction by its Bidi_Class: `ltr` for L, `rtl` for R and AL, null for the
 * others, which no paragraph takes its direction from.
 */
export function strongDirection(codePoint: number): TextDirection | null {
  runs ??= readRuns();
  const { starts, kinds } = runs;
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if ((starts[middle] ?? 0) <= codePoint) low = middle;
    else high = middle - 1;
  }
  const kind = kinds[low];
  return kind === 1 ? 'ltr' : kind === 2 ? 'rtl' : null;
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

// The direction of a run of text, or null when no character in it decides one. Isolates are read
// through, as the browser's `dir="auto"` reads them.
function textDirection(text: string): TextDirection | null {
  for (const character of text) {
    const direction = strongDirection(character.codePointAt(0) ?? 0);
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
