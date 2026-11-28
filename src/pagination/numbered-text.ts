// The text layout the engine's block geometry reads (DOCE-PAGINATION-11.2): a heading's number
// before its first line, a numbered paragraph's number, the words other plugins insert, and, while
// a container is laid out for its nested lines, each text block's line table written down.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { BlockTextLayout } from '../layout-engine/blocks/types.js';
import type { ParagraphNumber } from '../layout-engine/numbers.js';
import type { createTextLayout } from '../layout-engine/text-layout.js';
import type { InsertedTexts } from './inserted-texts.js';
import type { LinesRecorder } from './nested-lines.js';

/** The numbers the text is laid out with, by node. */
interface TextNumbers {
  readonly prefixes: ReadonlyMap<ProseMirrorNode, string>;
  readonly paragraphs: ReadonlyMap<ProseMirrorNode, ParagraphNumber>;
}

// The text layout block geometry reads, with each heading's number before its first line. A
// paragraph's line table is kept whole in its measurement, so it splits at a computed line start.
export function numberedText(
  text: ReturnType<typeof createTextLayout>,
  {
    numbers,
    inserted,
    recorder,
  }: { numbers: () => TextNumbers; inserted: () => InsertedTexts; recorder: LinesRecorder },
): BlockTextLayout {
  const contentsText = (text as Partial<Pick<BlockTextLayout, 'layoutContentsText'>>)
    .layoutContentsText;
  return {
    typography: (node, scope) => text.typography(node, scope),
    layoutContentsRow: (row, place) => text.layoutContentsRow(row, place),
    contentsTextWidth: (value, level) => text.contentsTextWidth(value, level),
    textWidth: (value, node, scope) => text.textWidth(value, node, scope),
    ...(contentsText ? { layoutContentsText: contentsText } : {}),
    layoutText: (node, place) => {
      const { prefixes, paragraphs } = numbers();
      const prefix = place.prefix ?? prefixes.get(node);
      const number = paragraphs.get(node);
      const words = inserted().byBlock.get(node);
      const result = text.layoutText(node, {
        ...place,
        ...(prefix ? { prefix } : {}),
        number,
        ...(words ? { inserted: words } : {}),
      });
      if (result.ok && recorder.lines) {
        const justify = (place.align ?? text.typography(node, place.scope).align) === 'justify';
        recorder.lines.set(node, { ...result.table, justify });
      }
      return result;
    },
  };
}
