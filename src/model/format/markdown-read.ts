// Markdown read into a stored document, without the DOM: CommonMark's blocks with GitHub's tables,
// strikethrough and footnotes, fenced code with its language, `$$` display math, and the shapes the
// library's own writer gives tables, figures and captions. A document read this way has no template
// or element ids yet; `composeDocumentFile` gives it both.

import {
  createImportWarnings,
  type ImportWarning,
  type ImportWarnings,
} from '../../import/import-warnings.js';
import { DOCUMENT_FORMAT_VERSION, type DocumentFile } from './document-format.js';
import { readBlocks } from './markdown-read-blocks.js';
import { type Fence, fenceAfter } from './markdown-read-fence.js';

/** A stored document read from Markdown, and what the reading left out. */
export interface MarkdownRead {
  readonly file: DocumentFile;
  readonly warnings: ImportWarning[];
}

const DEFINITION = /^ {0,3}\[(\^?)([^\]]+)\]:[ \t]*(.*)$/;

// The link and footnote definitions, taken out of the lines outside fenced code; a footnote's
// indented lines continue its text.
function takeDefinitions(source: readonly string[]) {
  const links = new Map<string, string>();
  const notes = new Map<string, string>();
  const rest: string[] = [];
  let fence: Fence | null = null;
  for (let at = 0; at < source.length; at += 1) {
    const line = source[at] ?? '';
    const inFence = fence !== null;
    fence = fenceAfter(line, fence);
    const definition = inFence || fence ? null : DEFINITION.exec(line);
    if (!definition) {
      rest.push(line);
      continue;
    }
    const [, note, label = '', value = ''] = definition;
    if (!note) {
      links.set(label.toLowerCase(), /^<?([^\s>]*)/.exec(value)?.[1] ?? '');
      continue;
    }
    const text = [value];
    while (/^( {2,}|\t)\S/.test(source[at + 1] ?? '')) text.push((source[(at += 1)] ?? '').trim());
    notes.set(label, text.join('\n'));
  }
  return { links, notes, rest };
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
  const { links, notes, rest } = takeDefinitions(body.split('\n'));
  const content = readBlocks(rest, { links, notes, warnings });
  return {
    file: { formatVersion: DOCUMENT_FORMAT_VERSION, sections: [{ content }] },
    warnings: warnings.list(),
  };
}
