import { describe, expect, it } from 'vitest';
import type { ScriptVocabularyEntry } from '../../host/index.js';
import { groupScriptVocabulary, scriptCompletions, scriptEntryAt } from './script-language.js';

const VOCABULARY: ScriptVocabularyEntry[] = [
  { name: 'render', kind: 'object', description: 'Builds blocks.' },
  {
    name: 'render.paragraph',
    kind: 'function',
    signature: 'render.paragraph(text)',
    description: 'Adds a paragraph.',
  },
  { name: 'render.table.row', kind: 'function' },
  { name: 'const', kind: 'keyword' },
];

describe('script language', () => {
  it('DOCE-EDITOR-4.9 completes the names at the top, and an object’s members after its dot', () => {
    const top = scriptCompletions(VOCABULARY, 'ren', 3);
    expect(top.from).toBe(0);
    expect(top.options.map((option) => option.label)).toEqual(['render', 'const']);
    const members = scriptCompletions(VOCABULARY, 'x = render.pa', 13);
    expect(members.from).toBe(11);
    expect(members.options).toEqual([
      expect.objectContaining({
        label: 'paragraph',
        kind: 'function',
        description: 'render.paragraph(text)',
        documentation: 'Adds a paragraph.',
      }),
    ]);
  });

  it('DOCE-EDITOR-4.9 documents the name under the pointer and groups the reference by object', () => {
    const script = 'render.paragraph("x")';
    expect(scriptEntryAt(VOCABULARY, script, 9)?.name).toBe('render.paragraph');
    expect(scriptEntryAt(VOCABULARY, script, 2)?.name).toBe('render');
    expect(scriptEntryAt(VOCABULARY, script, 18)).toBeNull();
    expect(
      groupScriptVocabulary(VOCABULARY).map(([root, entries]) => [root, entries.length]),
    ).toEqual([
      ['', 1],
      ['render', 1],
      ['render.table', 1],
    ]);
  });
});
