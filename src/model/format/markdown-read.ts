// Markdown read into a stored document, without the DOM, through mdast-util-from-markdown:
// CommonMark's blocks with GitHub's tables, strikethrough, footnotes and task list items, `$$`
// display math, inline math as Pandoc reads it, and the shapes the library's own writer gives
// tables, figures and captions. A document read this way has no template or element ids yet;
// `composeDocumentFile` gives it both.

import type { Definition, FootnoteDefinition } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFootnoteFromMarkdown } from 'mdast-util-gfm-footnote';
import { gfmStrikethroughFromMarkdown } from 'mdast-util-gfm-strikethrough';
import { gfmTableFromMarkdown } from 'mdast-util-gfm-table';
import { gfmTaskListItemFromMarkdown } from 'mdast-util-gfm-task-list-item';
import { mathFromMarkdown } from 'mdast-util-math';
import { gfmFootnote } from 'micromark-extension-gfm-footnote';
import { gfmStrikethrough } from 'micromark-extension-gfm-strikethrough';
import { gfmTable } from 'micromark-extension-gfm-table';
import { gfmTaskListItem } from 'micromark-extension-gfm-task-list-item';
import { math } from 'micromark-extension-math';
import {
  createImportWarnings,
  type ImportWarning,
  type ImportWarnings,
} from '../../import/import-warnings.js';
import { DOCUMENT_FORMAT_VERSION, type DocumentFile } from './document-format.js';
import { readBlocks } from './markdown-read-blocks.js';
import { flattenDeepNesting } from './markdown-read-depth.js';
import { pandocMath, pandocMathFromMarkdown } from './markdown-read-math.js';
import { variables, variablesFromMarkdown } from './markdown-read-variables.js';

/** A stored document read from Markdown, and what the reading left out. */
export interface MarkdownRead {
  readonly file: DocumentFile;
  readonly warnings: ImportWarning[];
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
  const tree = fromMarkdown(source, {
    extensions: [
      gfmTable(),
      gfmStrikethrough({ singleTilde: false }),
      gfmFootnote(),
      gfmTaskListItem(),
      // Only `$$` display math on lines of its own: inline math is read as Pandoc reads it.
      { flow: math().flow },
      pandocMath(),
      variables,
    ],
    mdastExtensions: [
      gfmTableFromMarkdown(),
      gfmStrikethroughFromMarkdown(),
      gfmFootnoteFromMarkdown(),
      gfmTaskListItemFromMarkdown(),
      mathFromMarkdown(),
      pandocMathFromMarkdown,
      variablesFromMarkdown,
    ],
  });
  const links = new Map<string, Definition>();
  const notes = new Map<string, FootnoteDefinition>();
  for (const node of tree.children) {
    if (node.type === 'definition' && !links.has(node.identifier)) links.set(node.identifier, node);
    if (node.type === 'footnoteDefinition' && !notes.has(node.identifier))
      notes.set(node.identifier, node);
  }
  flattenDeepNesting(tree, warnings);
  const content = readBlocks(tree.children, { links, notes, warnings, source });
  return {
    file: { formatVersion: DOCUMENT_FORMAT_VERSION, sections: [{ content }] },
    warnings: warnings.list(),
  };
}
