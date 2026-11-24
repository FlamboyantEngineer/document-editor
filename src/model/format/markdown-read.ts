// Markdown read into a stored document, without the DOM, through markdown-it: CommonMark's blocks
// with GitHub's tables and strikethrough, footnotes (markdown-it-footnote), `$$` display math,
// inline math as Pandoc reads it, `{{key}}` variables, and the shapes the library's own writer
// gives tables, figures and captions. A document read this way has no template or element ids
// yet; `composeDocumentFile` gives it both.

import markdownIt, { type MarkdownIt, type Token } from 'markdown-it';
import footnote from 'markdown-it-footnote';
import {
  createImportWarnings,
  type ImportWarning,
  type ImportWarnings,
} from '../../import/import-warnings.js';
import { DOCUMENT_FORMAT_VERSION, type DocumentFile } from './document-format.js';
import { readBlocks } from './markdown-read-blocks.js';
import { flattenDeepNesting } from './markdown-read-depth.js';
import { math } from './markdown-read-math.js';
import { variables } from './markdown-read-variables.js';

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
  return md;
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
 * underline, superscript, subscript, strikethrough, emphasis, strong, code and line breaks.
 */
export function readMarkdown(markdown: string): MarkdownRead {
  const warnings: ImportWarnings = createImportWarnings();
  const text = markdown.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
  const source = text.replace(/^---\n[\s\S]*?\n(?:---|\.\.\.)\n/, '');
  const { notes, body } = takeNotes(markdownParser().parse(source, {}));
  const blocks = readBlocks(body, { notes, noteText: new Map(), warnings });
  const content = flattenDeepNesting(blocks, warnings);
  return {
    file: { formatVersion: DOCUMENT_FORMAT_VERSION, sections: [{ content }] },
    warnings: warnings.list(),
  };
}
