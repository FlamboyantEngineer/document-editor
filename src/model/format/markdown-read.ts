// Markdown read into a stored document, without the DOM: CommonMark's blocks with GitHub's tables,
// strikethrough and footnotes, fenced code with its language, `$$` display math, and the shapes the
// library's own writer gives tables, figures and captions. A document read this way has no template
// or element ids yet; `composeDocumentFile` gives it both.

import {
  createImportWarnings,
  type ImportWarning,
  type ImportWarnings,
} from '../../import/import-warnings.js';
import { cloneJson } from '../clone-json.js';
import { DOCUMENT_FORMAT_VERSION, type DocumentFile, type StoredNode } from './document-format.js';
import { type BlockContext, readBlocks } from './markdown-read-blocks.js';
import { withObjects } from './markdown-read-captions.js';
import { type InlineContext, readInline } from './markdown-read-inline.js';

/** A stored document read from Markdown, and what the reading left out. */
export interface MarkdownRead {
  readonly file: DocumentFile;
  readonly warnings: ImportWarning[];
}

// The parser discovers the source positions in order. Their warnings can come later, when a
// paragraph is read with its link definitions or a footnote is read by its first reference.
function orderedWarnings() {
  type Entry = Parameters<ImportWarnings['add']>;
  const scopes: (Entry[] | undefined)[] = [];
  return {
    next: (): InlineContext['warnings'] => {
      const index = scopes.length;
      scopes.push(undefined);
      return {
        add: (...entry) => {
          (scopes[index] ??= []).push(entry);
        },
      };
    },
    list: () => {
      const warnings = createImportWarnings();
      for (const entries of scopes) {
        for (const entry of entries ?? []) warnings.add(...entry);
      }
      return warnings.list();
    },
  };
}

function deferNote(source: string, context: InlineContext): () => StoredNode[] {
  let content: StoredNode[] | undefined;
  return () => {
    if (content) return cloneJson(content);
    content = readInline(source, { ...context, inNote: true });
    return content;
  };
}

// Attach the parsed inline content and join the captions with the objects they caption.
function resolveBlock(node: StoredNode, context: BlockContext): StoredNode {
  const inline = context.inlineContent.get(node);
  if (inline) return inline.length ? { ...node, content: inline } : node;
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
  const warnings = orderedWarnings();
  const text = markdown.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
  const body = text.replace(/^---\n[\s\S]*?\n(?:---|\.\.\.)\n/, '');
  const links = new Map<string, string>();
  const notes = new Map<string, () => StoredNode[]>();
  const context: BlockContext = {
    links,
    notes,
    defineNote: (label, source) =>
      notes.set(label, deferNote(source, { links, notes, warnings: warnings.next() })),
    nextWarnings: warnings.next,
    deferred: [],
    inlineContent: new WeakMap(),
  };
  const blocks = readBlocks(body.split('\n'), context);
  for (const read of context.deferred) read();
  const content = withObjects(blocks.map((block) => resolveBlock(block, context)));
  return {
    file: { formatVersion: DOCUMENT_FORMAT_VERSION, sections: [{ content }] },
    warnings: warnings.list(),
  };
}
