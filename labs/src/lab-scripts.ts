// The full editor lab's scripts: a small language a host might offer, one statement a line.
// `render.paragraph(text)`, `render.heading(text, level)`, `render.equation(latex)` and
// `render.table(row, row, ...)` produce blocks through the script output builders
// (`buildScriptParagraph` and the others), where each text is a quoted string whose
// `${document.blocks}` and `${document.title}` read the document, and a table's row is one string
// with its cells between `|`, the first row its header. Anything else is a problem the check
// reports, by its line.

import {
  buildScriptEquation,
  buildScriptHeading,
  buildScriptParagraph,
  buildScriptTable,
} from '../../src/document/index.js';
import type { ScriptDiagnostic, ScriptVocabularyEntry } from '../../src/host/index.js';
import type { DocumentFile, StoredContent } from '../../src/model/index.js';

/** The names the lab's scripts can use. */
export const LAB_SCRIPT_VOCABULARY: readonly ScriptVocabularyEntry[] = [
  { name: 'document', kind: 'object', description: 'The document the script runs in.' },
  {
    name: 'document.blocks',
    kind: 'property',
    signature: 'document.blocks',
    description: 'How many blocks the document holds.',
  },
  {
    name: 'document.title',
    kind: 'property',
    signature: 'document.title',
    description: "The document's first heading.",
  },
  { name: 'render', kind: 'object', description: 'Builds the blocks the script shows.' },
  {
    name: 'render.paragraph',
    kind: 'function',
    signature: 'render.paragraph(text)',
    description: 'Adds a paragraph of the text.',
  },
  {
    name: 'render.heading',
    kind: 'function',
    signature: 'render.heading(text, level)',
    description: 'Adds a heading of the text at a level from 1 to 6.',
  },
  {
    name: 'render.equation',
    kind: 'function',
    signature: 'render.equation(latex)',
    description: 'Adds a displayed equation of the LaTeX.',
  },
  {
    name: 'render.table',
    kind: 'function',
    signature: 'render.table(row, ...rows)',
    description: 'Adds a table, each row a string of cells between |, the first row its header.',
  },
  {
    name: 'summary',
    kind: 'snippet',
    description: 'A paragraph counting the blocks.',
    insertText: 'render.paragraph(`The document has ${document.blocks} blocks.`)',
  },
];

// The document's values a script's text reads.
function values(document: DocumentFile) {
  const blocks = document.sections.reduce((sum, section) => sum + section.content.length, 0);
  const heading = document.sections
    .flatMap((section) => section.content)
    .find((node) => node.type === 'heading');
  const title = (heading?.content ?? []).map((node) => node.text ?? '').join('');
  return { 'document.blocks': String(blocks), 'document.title': title };
}

// A quoted string with the document's values in it, or null when it is not one.
function quoted(argument: string, document: DocumentFile | null): string | null {
  const match = /^(['"`])(.*)\1$/.exec(argument.trim());
  if (!match) return null;
  const read = document ? values(document) : null;
  return (match[2] ?? '').replace(/\$\{\s*(document\.\w+)\s*\}/g, (all, name: string) =>
    read ? (read[name as keyof typeof read] ?? all) : all,
  );
}

// A table's rows, each a quoted string of cells between `|`; null unless every argument is one.
function tableRows(argumentList: string, document: DocumentFile | null): string[][] | null {
  const strings = argumentList.match(/(['"`])(?:(?!\1).)*\1/g) ?? [];
  const rest = strings.reduce((left, string) => left.replace(string, ''), argumentList);
  if (strings.length === 0 || rest.replace(/[\s,]/g, '')) return null;
  return strings.map((string) =>
    (quoted(string, document) ?? '').split('|').map((cell) => cell.trim()),
  );
}

type Statement =
  | { readonly ok: true; readonly node: StoredContent[number] | null }
  | { readonly ok: false; readonly message: string };

// One line of a script: a block it adds, nothing, or a problem.
function statement(line: string, document: DocumentFile | null): Statement {
  const code = line.trim().replace(/;$/, '');
  if (!code || code.startsWith('//')) return { ok: true, node: null };
  const paragraph = /^render\.paragraph\((.*)\)$/.exec(code);
  const heading = /^render\.heading\((.*),\s*([1-6])\)$/.exec(code);
  const equation = /^render\.equation\((.*)\)$/.exec(code);
  const table = /^render\.table\((.*)\)$/.exec(code);
  const argument = quoted((paragraph ?? heading ?? equation)?.[1] ?? '', document);
  const rows = table ? tableRows(table[1] ?? '', document) : null;
  if (rows) return { ok: true, node: buildScriptTable(rows, { header: rows.length > 1 }) };
  if (equation && argument !== null) return { ok: true, node: buildScriptEquation(argument) };
  if (paragraph && argument !== null) return { ok: true, node: buildScriptParagraph(argument) };
  if (heading && argument !== null) {
    return { ok: true, node: buildScriptHeading(argument, { level: Number(heading[2]) }) };
  }
  return { ok: false, message: `Not a statement the lab knows: ${code}` };
}

/** The problems in a script, by line. */
export function checkLabScript(source: string): ScriptDiagnostic[] {
  return source.split('\n').flatMap((line, index) => {
    const result = statement(line, null);
    return result.ok
      ? []
      : [{ message: result.message, line: index + 1, column: line.search(/\S/) + 1 }];
  });
}

/** What a script produces in a document; a problem fails it. */
export function runLabScript({ source, document }: { source: string; document: DocumentFile }) {
  const blocks: StoredContent = [];
  for (const line of source.split('\n')) {
    const result = statement(line, document);
    if (!result.ok) throw new Error(result.message);
    if (result.node) blocks.push(result.node);
  }
  return blocks;
}
