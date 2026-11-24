// Markdown read into a stored document, without the DOM: CommonMark's blocks with GitHub's tables,
// strikethrough and footnotes, fenced code with its language, `$$` display math, and the shapes the
// library's own writer gives tables, figures and captions. A document read this way has no template
// or element ids yet; `composeDocumentFile` gives it both.

import {
  createImportWarnings,
  type ImportWarning,
  type ImportWarnings,
} from '../../import/import-warnings.js';
import { DOCUMENT_FORMAT_VERSION, type DocumentFile, type StoredNode } from './document-format.js';
import { type BlockContext, readBlocks } from './markdown-read-blocks.js';
import { withObjects } from './markdown-read-captions.js';
import { readInline } from './markdown-read-inline.js';

/** A stored document read from Markdown, and what the reading left out. */
export interface MarkdownRead {
  readonly file: DocumentFile;
  readonly warnings: ImportWarning[];
}

// Definitions may follow their references. Resolve inline source and captions once every block
// has been read and the definitions are known.
function resolveBlock(node: StoredNode, context: BlockContext): StoredNode {
  const inline = context.inlineSource.get(node);
  if (inline !== undefined) {
    const content = readInline(inline, context);
    return content.length ? { ...node, content } : node;
  }
  if (!node.content) return node;
  const content = node.content.map((child) => resolveBlock(child, context));
  return {
    ...node,
    content:
      node.type === 'blockquote' || node.type === 'listItem' ? withObjects(content) : content,
  };
}

/**
 * Markdown as a stored document of one section (DOCE-IMPORT-4.1), with the warnings for what it
 * left out. Front matter is left out; so are HTML blocks and HTML tags other than the ones for
 * underline, superscript, subscript, strikethrough, emphasis, code and line breaks.
 */
export function readMarkdown(markdown: string): MarkdownRead {
  const warnings: ImportWarnings = createImportWarnings();
  const text = markdown.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
  const body = text.replace(/^---\n[\s\S]*?\n(?:---|\.\.\.)\n/, '');
  const context: BlockContext = {
    links: new Map(),
    notes: new Map(),
    warnings,
    inlineSource: new WeakMap(),
  };
  const blocks = readBlocks(body.split('\n'), context);
  const content = withObjects(blocks.map((block) => resolveBlock(block, context)));
  return {
    file: { formatVersion: DOCUMENT_FORMAT_VERSION, sections: [{ content }] },
    warnings: warnings.list(),
  };
}
