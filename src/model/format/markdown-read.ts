// Markdown read into a stored document, without the DOM, through mdast-util-from-markdown:
// CommonMark's blocks with GitHub's tables, strikethrough, footnotes and task list items, `$$`
// display math, inline math as Pandoc reads it, and the shapes the library's own writer gives
// tables, figures and captions. A document read this way has no template or element ids yet;
// `composeDocumentFile` gives it both.

import type { Definition, FootnoteDefinition, Nodes } from 'mdast';
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
import { createImportWarnings, type ImportWarning } from '../../import/import-warnings.js';
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

type WarningSource = Pick<Nodes, 'position'>;

/** Reports a change at the node that caused it, even when a later reference reads it. */
export type MarkdownWarning = (node: WarningSource, detail: string) => void;

const offsetOf = (node: WarningSource) => node.position?.start.offset ?? Number.MAX_SAFE_INTEGER;

function markdownWarnings() {
  // A source node can be read more than once. The report counts what the source holds.
  const entries = new Map<WarningSource, string>();
  const warn: MarkdownWarning = (node, detail) => {
    entries.set(node, detail);
  };
  const list = () => {
    const warnings = createImportWarnings();
    for (const [, detail] of [...entries].sort(([a], [b]) => offsetOf(a) - offsetOf(b))) {
      warnings.add('content-left-out', detail);
    }
    return warnings.list();
  };
  return { warn, list };
}

// Definitions in quotes and list items are visible throughout the document. Walk the source
// tree in order, keeping the first definition of each name and avoiding recursion on deep input.
function definitionsOf(tree: Nodes) {
  const links = new Map<string, Definition>();
  const notes = new Map<string, FootnoteDefinition>();
  const stack = [tree];
  while (stack.length) {
    const node = stack.pop();
    if (!node) break;
    if (node.type === 'definition' && !links.has(node.identifier)) links.set(node.identifier, node);
    if (node.type === 'footnoteDefinition' && !notes.has(node.identifier))
      notes.set(node.identifier, node);
    if (!('children' in node)) continue;
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = node.children[index];
      if (child) stack.push(child);
    }
  }
  return { links, notes };
}

/**
 * Markdown as a stored document of one section (DOCE-IMPORT-4.1), with the warnings for what it
 * left out. Front matter is left out; so are HTML blocks and HTML tags other than the ones for
 * underline, superscript, subscript, strikethrough, emphasis, strong, code and line breaks.
 */
export function readMarkdown(markdown: string): MarkdownRead {
  const { warn, list } = markdownWarnings();
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
  const { links, notes } = definitionsOf(tree);
  flattenDeepNesting(tree, warn);
  const content = readBlocks(tree.children, {
    links,
    notes,
    warn,
    noteContents: new WeakMap(),
    source,
  });
  return {
    file: { formatVersion: DOCUMENT_FORMAT_VERSION, sections: [{ content }] },
    warnings: list(),
  };
}
