// The text proofing reads: each prose block's text, with code, deleted suggestions and objects as
// spaces so offsets stay the block's, and long texts cut into segments a proofer takes at once.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type RegionKind, regionKind } from '../model/index.js';

// Page headers and footers, which the template fills.
const UNPROOFED_REGIONS: ReadonlySet<RegionKind | null> = new Set(['header', 'footer']);
// Blocks whose text is code.
const UNPROOFED_BLOCKS = new Set(['code_block', 'linked_code_block', 'math_display']);
// Text in these marks is left out: code, and text a suggestion deletes.
const UNPROOFED_MARKS = new Set(['code', 'deletion']);

/** A block's text and the document position of each of its characters. */
export interface ProofedBlock {
  readonly text: string;
  readonly language: string | null;
  /** The position of the block's content. */
  readonly start: number;
  /** Each character's offset in the block's content. */
  readonly offsets: readonly number[];
}

type BlockText = Omit<ProofedBlock, 'start'>;

// Each block's text, kept for as long as the block is, so a long document is read again only where
// it changed.
const blockTexts = new WeakMap<ProseMirrorNode, BlockText>();

function blockText(block: ProseMirrorNode): BlockText {
  const known = blockTexts.get(block);
  if (known) return known;
  let text = '';
  const offsets: number[] = [];
  block.forEach((child, offset) => {
    const skipped = child.marks.some((mark) => UNPROOFED_MARKS.has(mark.type.name));
    if (child.isText && child.text) {
      text += skipped ? ' '.repeat(child.text.length) : child.text;
      for (let index = 0; index < child.text.length; index += 1) offsets.push(offset + index);
    } else {
      text += ' ';
      offsets.push(offset);
    }
  });
  const language = typeof block.attrs.lang === 'string' ? block.attrs.lang : null;
  const read = { text, language, offsets };
  blockTexts.set(block, read);
  return read;
}

/**
 * Each prose block of the document, in order: the pages' bodies and footnote areas, without their
 * headers and footers.
 */
export function proofedBlocks(doc: ProseMirrorNode): ProofedBlock[] {
  const blocks: ProofedBlock[] = [];
  doc.descendants((node, pos) => {
    if (UNPROOFED_BLOCKS.has(node.type.name) || UNPROOFED_REGIONS.has(regionKind(node)))
      return false;
    if (!node.isTextblock) return true;
    const block = blockText(node);
    if (block.text.trim()) blocks.push({ ...block, start: pos + 1 });
    return false;
  });
  return blocks;
}

/** A piece of a text, and where it starts in it. */
export interface TextSegment {
  readonly text: string;
  readonly offset: number;
}

/**
 * A text cut into segments of at most `limit` characters, each ending after a sentence or, failing
 * one, a space, so a proofer never sees a word cut in two; a text within the limit is one segment.
 */
export function segmentsOf(text: string, limit: number): TextSegment[] {
  const segments: TextSegment[] = [];
  let offset = 0;
  while (text.length - offset > limit) {
    const window = text.slice(offset, offset + limit);
    const sentence = Math.max(
      window.lastIndexOf('. '),
      window.lastIndexOf('? '),
      window.lastIndexOf('! '),
    );
    const space = window.lastIndexOf(' ');
    const cut = sentence > 0 ? sentence + 2 : space > 0 ? space + 1 : limit;
    segments.push({ text: text.slice(offset, offset + cut), offset });
    offset += cut;
  }
  segments.push({ text: text.slice(offset), offset });
  return segments;
}
