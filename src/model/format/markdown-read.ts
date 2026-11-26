// Markdown read into a stored document, without the DOM, through markdown-it: CommonMark's blocks
// with GitHub's tables and strikethrough, footnotes (markdown-it-footnote), `$$` display math,
// inline math as Pandoc reads it, `{{key}}` variables, and the shapes the library's own writer
// gives tables, figures and captions. A document read this way has no template or element ids
// yet; `composeDocumentFile` gives it both.

import markdownIt, { type MarkdownIt, type StateCore, type Token } from 'markdown-it';
import footnote from 'markdown-it-footnote';
import {
  createImportWarnings,
  type ImportWarning,
  type ImportWarnings,
} from '../../import/import-warnings.js';
import { dataImageSize, type ImageSize, wholeSize } from '../schema/image-size.js';
import { DOCUMENT_FORMAT_VERSION, type DocumentFile } from './document-format.js';
import { readBlocks } from './markdown-read-blocks.js';
import { flattenDeepNesting } from './markdown-read-depth.js';
import { math } from './markdown-read-math.js';
import { variables } from './markdown-read-variables.js';
import { createSourceWarnings } from './markdown-read-warnings.js';

/** What reading Markdown needs from its host. */
export interface MarkdownReadOptions {
  /**
   * The natural size of the image at an address, such as the host's asset adapter knows it; an
   * image whose address holds its bytes (a data address) is sized from them. An image neither
   * sizes is left out with an `image-left-out` warning.
   */
  readonly imageSize?: ((src: string) => ImageSize | null | undefined) | undefined;
}

/** A stored document read from Markdown, and what the reading left out. */
export interface MarkdownRead {
  readonly file: DocumentFile;
  readonly warnings: ImportWarning[];
}

// The parser, made for each reading so no state outlives it: HTML is tokenized so the reader can keep the formatting tags, addresses
// are kept as written (the stored format checks them where they are shown), and inline footnotes
// (`^[…]`) and typographic replacements stay off, as they are not Markdown the writer gives.
function markdownParser(): MarkdownIt {
  const md = markdownIt({ html: true, linkify: false, typographer: false });
  md.validateLink = () => true;
  md.normalizeLink = (url) => url;
  md.normalizeLinkText = (url) => url;
  md.use(footnote).use(math).use(variables);
  md.disable('footnote_inline');
  md.core.ruler.before('footnote_tail', 'first_notes', firstNotes);
  return md;
}

// The first definition of each footnote label wins, as for links: the plugin keeps the last, so
// a later definition of a label is dropped before it gathers them.
function firstNotes(state: StateCore): void {
  const seen = new Set<string>();
  let dropping = 0;
  state.tokens = state.tokens.filter((token) => {
    if (token.type === 'footnote_reference_open') {
      const label = String((token.meta as { label: string }).label);
      if (dropping || seen.has(label)) dropping += 1;
      seen.add(label);
    }
    const kept = dropping === 0;
    if (token.type === 'footnote_reference_close' && dropping) dropping -= 1;
    return kept;
  });
}

// Each footnote definition's tokens, by id, and the tokens before the footnote list.
function takeNotes(tokens: readonly Token[]) {
  const notes = new Map<number, Token[]>();
  let current: Token[] | null = null;
  const list = tokens.findIndex((token) => token.type === 'footnote_block_open');
  for (const token of list < 0 ? [] : tokens.slice(list)) {
    if (token.type === 'footnote_open') {
      current = [];
      notes.set((token.meta as { id: number }).id, current);
    } else if (token.type === 'footnote_close') current = null;
    else current?.push(token);
  }
  return { notes, body: list < 0 ? tokens : tokens.slice(0, list) };
}

/**
 * Markdown as a stored document of one section (DOCE-IMPORT-4.1), with the warnings for what it
 * left out. Front matter is left out; so are HTML blocks and HTML tags other than the ones for
 * underline, superscript, subscript, strikethrough, emphasis, strong, code and line breaks. An
 * image takes its natural size from its bytes or `options.imageSize` (in whole pixels, at least
 * one), or is left out.
 */
export function readMarkdown(markdown: string, options: MarkdownReadOptions = {}): MarkdownRead {
  const warnings: ImportWarnings = createImportWarnings();
  const text = markdown.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
  const source = text.replace(/^---\n[\s\S]*?\n(?:---|\.\.\.)\n/, '');
  const { notes, body } = takeNotes(markdownParser().parse(source, {}));
  const met = createSourceWarnings();
  const imageSize = (src: string) => dataImageSize(src) ?? wholeSize(options.imageSize?.(src));
  const blocks = readBlocks(body, { notes, noteText: new Map(), warnings: met, imageSize });
  met.giveTo(warnings);
  const content = flattenDeepNesting(blocks, warnings);
  return {
    file: { formatVersion: DOCUMENT_FORMAT_VERSION, sections: [{ content }] },
    warnings: warnings.list(),
  };
}
