// Captions in Markdown as the library's writer places them: an all-italic paragraph after a figure
// or before a table, its italics taken off and its formats and footnotes kept.

import { storedBodyOf, storedCaption, storedCaptionText } from '../schema/caption-content.js';
import type { StoredNode } from './document-format.js';

const isItalic = (node: StoredNode) => node.marks?.some((mark) => mark.type === 'italic') === true;

// The content of a paragraph whose text is all italic, which the writer gives a caption as, the
// italics taken off and its footnotes and other formats kept; else null. The spaces between
// italic runs are written outside them.
function captionContent(node: StoredNode | undefined): StoredNode[] | null {
  if (node?.type !== 'paragraph' || !node.content?.length) return null;
  const texts = node.content.filter((child) => child.type === 'text');
  const plain = texts.some((child) => !isItalic(child) && child.text?.trim());
  const other = node.content.some((child) => !['text', 'footnote'].includes(child.type));
  if (!texts.some(isItalic) || plain || other) return null;
  return joinText(node.content.map(withoutItalics));
}

// A node without its italics.
function withoutItalics(node: StoredNode): StoredNode {
  const marks = node.marks?.filter((mark) => mark.type !== 'italic') ?? [];
  const { marks: _, ...bare } = node;
  return marks.length ? { ...bare, marks } : bare;
}

// Inline content with each text joined to the text before it with the same marks, as the italics
// parted them.
function joinText(content: readonly StoredNode[]): StoredNode[] {
  const joined: StoredNode[] = [];
  for (const next of content) {
    const last = joined[joined.length - 1];
    if (last?.type === 'text' && next.type === 'text' && sameMarks(last, next))
      joined[joined.length - 1] = { ...last, text: `${last.text ?? ''}${next.text ?? ''}` };
    else joined.push(next);
  }
  return joined;
}

const sameMarks = (a: StoredNode, b: StoredNode) =>
  JSON.stringify(a.marks ?? []) === JSON.stringify(b.marks ?? []);

// The block after `last` with a caption paragraph taken in: into a figure before it, or into the
// table after it; null when it takes none.
function captioned(last: StoredNode | undefined, block: StoredNode): StoredNode | null {
  const caption = captionContent(block);
  if (caption !== null && last?.type === 'figure' && last.attrs?.captionEnabled === false) {
    const { captionEnabled: _, ...attrs } = last.attrs;
    return { ...last, attrs, content: [{ type: 'caption', content: caption }] };
  }
  const above = captionContent(last);
  if (block.type === 'table' && above !== null && !storedCaptionText(block)) {
    return { ...block, content: [{ type: 'caption', content: above }, ...storedBodyOf(block)] };
  }
  return null;
}

// A paragraph holding only an image as a figure, and a caption paragraph taken into the table
// after it or the figure before it, as the writer places them.
export function withObjects(blocks: readonly StoredNode[]): StoredNode[] {
  const out: StoredNode[] = [];
  for (const block of blocks) {
    const image =
      block.type === 'paragraph' && block.content?.length === 1 ? block.content[0] : null;
    const joined = captioned(out[out.length - 1], block);
    if (joined) out[out.length - 1] = joined;
    else if (image?.type === 'image') {
      out.push({
        type: 'figure',
        attrs: { ...image.attrs, captionEnabled: false },
        content: [storedCaption('')],
      });
    } else out.push(block);
  }
  return out;
}
