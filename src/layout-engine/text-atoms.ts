// The inline atoms a page draws as plain text in its line: a footnote marker's number, a mention's
// `@name`, a glossary reference's text and an inline embed's stored text. The engine lays each out as text in the font the page
// draws it in, kept whole on one line, as the page cannot break inside an atom (DOCE-PAGINATION-9.5).

import type { RichInlineItem } from '@chenglou/pretext/rich-inline';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { abbreviationDisplayText } from '../model/glossary.js';
import { mentionPresentation } from '../model/schema/inline-atom-nodes.js';
import { type BlockTypography, fontString, markedFont, smallerFont } from './typography.js';

/** The inline atoms the engine lays out as their text, unless a host draws them itself. */
export const TEXT_ATOMS: ReadonlySet<string> = new Set([
  'footnote_reference',
  'mention',
  'abbreviation_reference',
  'embed_inline',
]);

/**
 * The text atoms the pages' engine still leaves to the DOM, with why: none, since a footnote
 * marker's `sup` no longer raises its line (DOCE-PAGINATION-9.3).
 */
export const REFUSED_TEXT_ATOMS: ReadonlyMap<string, string> = new Map<string, string>();

/** What a text atom's text comes from. */
export interface TextAtomSource {
  /** A footnote marker's number (`numbersByNode`); a marker without one draws nothing. */
  readonly footnoteOf?: ((marker: ProseMirrorNode) => string | undefined) | undefined;
  /** Text atoms not laid out, with why (`REFUSED_TEXT_ATOMS`); none by default. */
  readonly refused?: ReadonlyMap<string, string> | undefined;
}

/**
 * A text atom as the item a line holds: its text in the font it is drawn in, unbreakable; null for
 * an atom that is not drawn as text. A marker without a number is an empty box.
 */
export function textAtomItem(
  node: ProseMirrorNode,
  typography: BlockTypography,
  source: TextAtomSource,
): RichInlineItem | { readonly width: number } | null {
  const font = markedFont(typography, node.marks);
  switch (node.type.name) {
    case 'footnote_reference': {
      // Drawn in a `sup`, which takes `font-size: smaller`.
      const number = source.footnoteOf?.(node) ?? '';
      if (!number) return { width: 0 };
      return { text: number, font: fontString(smallerFont(font)), break: 'never' };
    }
    case 'mention': {
      const person = { id: String(node.attrs.userId || ''), label: String(node.attrs.label || '') };
      const { text } = mentionPresentation(person, { mentionClass: '' });
      return { text, font: fontString(font), break: 'never' };
    }
    case 'abbreviation_reference': {
      const text = abbreviationDisplayText(node.attrs);
      // Drawn as an underlined link, whose line end Chromium places by its last letter's width.
      return { text, font: fontString(font), break: 'never', accurateLineEnds: true };
    }
    case 'embed_inline': {
      // Its stored text, drawn with a dotted underline, whose line end Chromium places as a link's.
      const text = String(node.attrs.text ?? '');
      if (!text) return { width: 0 };
      return { text, font: fontString(font), break: 'never', accurateLineEnds: true };
    }
    default:
      return null;
  }
}
