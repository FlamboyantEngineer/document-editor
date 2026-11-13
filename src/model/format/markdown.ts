// A stored document as Markdown, with GitHub's tables, strikethrough and footnotes: its headings,
// paragraphs, lists, quotes, code, math, tables and figures, its suggestions accepted or rejected,
// and its footnotes as numbered definitions at the end. Formats Markdown lacks, such as underline,
// superscript and subscript, are written as HTML. A host may add a title and front matter before
// the text, and its comment threads and a list of the suggestions after it.

import type { DocumentFile } from './document-format.js';
import type { SuggestionsMode } from './left-out.js';
import {
  type MarkdownThread,
  type PersonName,
  suggestionsOf,
  threadsOf,
} from './markdown/appendix.js';
import { blocks } from './markdown/blocks.js';
import { escapeHeadingEnd, escapeText } from './markdown/escape.js';
import { frontMatterOf, type FrontMatterValue } from './markdown/front-matter.js';
import type { MarkdownValues, Writing } from './markdown/writing.js';

export type { MarkdownComment, MarkdownThread, PersonName } from './markdown/appendix.js';
export type { FrontMatterValue } from './markdown/front-matter.js';
export type { MarkdownValues } from './markdown/writing.js';

/** How `writeMarkdown` writes a document. */
export interface MarkdownOptions {
  /** Whether the suggestions are written as if accepted (the default) or rejected. */
  readonly suggestions?: SuggestionsMode | undefined;
  /** The values of the document's variables and the addresses of its assets. */
  readonly values?: MarkdownValues | undefined;
  /** The document's title, written first as a level-1 heading. */
  readonly title?: string | null | undefined;
  /** Properties written as YAML front matter before everything else, such as `{ author }`. */
  readonly frontMatter?: Readonly<Record<string, FrontMatterValue | undefined>> | null | undefined;
  /** The document's comment threads, listed under "Comments" at the end in the order of their text. */
  readonly threads?: readonly MarkdownThread[] | undefined;
  /** Whether the document's suggestions are listed under "Suggestions" at the end. */
  readonly suggestionList?: boolean | undefined;
  /** A person's name by id, for the authors of comments and suggestions. */
  readonly person?: PersonName | undefined;
}

/** A stored document as Markdown, its footnotes defined at the end. */
export function writeMarkdown(file: DocumentFile, options: MarkdownOptions = {}): string {
  const writing: Writing = {
    suggestions: options.suggestions ?? 'accepted',
    values: options.values ?? {},
    footnotes: [],
  };
  const content = file.sections.flatMap((section) => section.content);
  const frontMatter = options.frontMatter ? frontMatterOf(options.frontMatter) : null;
  const title = options.title?.trim()
    ? `# ${escapeHeadingEnd(escapeText(options.title.trim()))}`
    : null;
  const body = blocks(content, writing);
  const notes = writing.footnotes.map((note, index) => `[^${String(index + 1)}]: ${note}`);
  const threads = options.threads?.length
    ? threadsOf(content, options.threads, options.person)
    : null;
  const suggestions = options.suggestionList ? suggestionsOf(content, options.person) : null;
  const parts = [
    frontMatter,
    title,
    ...body,
    threads && `## Comments\n\n${threads}`,
    suggestions && `## Suggestions\n\n${suggestions}`,
    notes.length ? notes.join('\n') : null,
  ];
  return `${parts.filter((part) => part !== null).join('\n\n')}\n`;
}
