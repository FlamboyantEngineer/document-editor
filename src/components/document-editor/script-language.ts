// What the script editor knows of the language: the standard names and keywords every script has,
// beside the host's vocabulary; the completions at the caret, a member of an object after its dot
// or a name otherwise; and the documentation of the name under the pointer.

import type {
  Completion,
  CompletionResult,
} from '@flamboyantengineer/ui-components/completion-list';
import type { ScriptVocabularyEntry } from '../../host/index.js';

const keyword = (name: string): ScriptVocabularyEntry => ({ name, kind: 'keyword' });

/** The keywords and standard objects every script has, after the host's own names. */
export const SCRIPT_STANDARD_VOCABULARY: readonly ScriptVocabularyEntry[] = [
  ...[
    'const',
    'let',
    'function',
    'return',
    'if',
    'else',
    'for',
    'of',
    'in',
    'while',
    'break',
    'continue',
    'new',
    'typeof',
    'true',
    'false',
    'null',
    'undefined',
  ].map(keyword),
  { name: 'Math', kind: 'object', description: 'Mathematical constants and functions.' },
  { name: 'Math.round', kind: 'function', signature: 'Math.round(x)', description: 'x rounded.' },
  {
    name: 'Math.max',
    kind: 'function',
    signature: 'Math.max(...values)',
    description: 'The largest.',
  },
  {
    name: 'Math.min',
    kind: 'function',
    signature: 'Math.min(...values)',
    description: 'The smallest.',
  },
  { name: 'JSON', kind: 'object', description: 'Reading and writing JSON.' },
  {
    name: 'JSON.stringify',
    kind: 'function',
    signature: 'JSON.stringify(value)',
    description: 'The value as JSON text.',
  },
  {
    name: 'JSON.parse',
    kind: 'function',
    signature: 'JSON.parse(text)',
    description: 'JSON text read.',
  },
  { name: 'Date', kind: 'object', description: 'Dates and times.' },
  { name: 'Number', kind: 'object', description: 'Numbers and their formatting.' },
  { name: 'String', kind: 'object', description: 'Text.' },
  { name: 'Array', kind: 'object', description: 'Lists of values.' },
  { name: 'Object', kind: 'object', description: 'Records of named values.' },
  { name: 'Map', kind: 'object', description: 'Values by key.' },
  { name: 'Set', kind: 'object', description: 'Distinct values.' },
];

// The text a completion shows of an entry: its signature, else its description.
function completionOf(entry: ScriptVocabularyEntry, label: string): Completion {
  return {
    label,
    kind: entry.kind ?? 'property',
    description: entry.signature ?? entry.description,
    documentation: [entry.signature && entry.description, entry.documentation]
      .filter(Boolean)
      .join('\n\n'),
    insertText: entry.insertText,
  };
}

// The dotted name that ends at a place in the text, such as `render.para`.
const nameBefore = (text: string) => /[\w$]+(?:\.[\w$]*)*$/.exec(text)?.[0] ?? '';

/**
 * The completions at the caret: after an object and a dot, its members; otherwise the names that
 * are not members, the host's first.
 */
export function scriptCompletions(
  vocabulary: readonly ScriptVocabularyEntry[],
  value: string,
  caret: number,
): CompletionResult {
  const written = nameBefore(value.slice(0, caret));
  const dot = written.lastIndexOf('.');
  if (dot < 0) {
    return {
      from: caret - written.length,
      options: vocabulary
        .filter((entry) => !entry.name.includes('.'))
        .map((entry) => completionOf(entry, entry.name)),
    };
  }
  const object = written.slice(0, dot + 1);
  return {
    from: caret - (written.length - dot - 1),
    options: vocabulary
      .filter(
        (entry) => entry.name.startsWith(object) && !entry.name.slice(object.length).includes('.'),
      )
      .map((entry) => completionOf(entry, entry.name.slice(object.length))),
  };
}

/** The entry named at a place in the script, or null: the dotted name the place is in. */
export function scriptEntryAt(
  vocabulary: readonly ScriptVocabularyEntry[],
  value: string,
  offset: number,
): ScriptVocabularyEntry | null {
  const after = /^[\w$]*/.exec(value.slice(offset))?.[0] ?? '';
  const name = nameBefore(value.slice(0, offset)) + after;
  return vocabulary.find((entry) => entry.name === name) ?? null;
}

/** The entries by the object they belong to, in order: the names without an object first. */
export function groupScriptVocabulary(
  vocabulary: readonly ScriptVocabularyEntry[],
): [string, ScriptVocabularyEntry[]][] {
  const groups = new Map<string, ScriptVocabularyEntry[]>();
  for (const entry of vocabulary) {
    if (entry.kind === 'keyword') continue;
    const dot = entry.name.lastIndexOf('.');
    const root = dot < 0 ? '' : entry.name.slice(0, dot);
    groups.set(root, [...(groups.get(root) ?? []), entry]);
  }
  return [...groups];
}
