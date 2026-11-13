// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listSuggestions } from '../engine/suggestion-decisions.js';
import {
  createDocumentSchema,
  type DocumentFile,
  readDocumentFile,
  resolveTemplateFile,
  type StoredNode,
  type TemplateFile,
} from '../model/index.js';
import { applyStoredEdits, describeDocument, type StoredEditOptions } from './automation.js';

const schema = createDocumentSchema();
const FIXTURES = 'test/fixtures/documents';

const fixture = <T>(name: string) =>
  JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8')) as T;

function storedFixture(name: string) {
  const content = fixture<DocumentFile>(name);
  const template = resolveTemplateFile(fixture<TemplateFile>(`templates/${content.template?.id}`), {
    loadTemplate: (id) => fixture<TemplateFile>(`templates/${id}`),
  });
  return { stored: { content, revision: 'r1' }, template };
}

const paragraph = (id: string, text: string): StoredNode => ({
  type: 'paragraph',
  attrs: { id },
  content: [{ type: 'text', text }],
});

const stored = (...content: StoredNode[]) => ({
  content: { formatVersion: 1, sections: [{ name: null, content }] } as DocumentFile,
  revision: 'r1',
});

let count = 0;
const AGENT: StoredEditOptions = {
  schema,
  revision: 'r1',
  actor: { id: 'agent-1', kind: 'agent', session: 's1' },
  mode: 'direct',
  newId: () => (0xc0000000 + (count += 1)).toString(16),
};

const texts = (content: DocumentFile) =>
  content.sections.flatMap((section) =>
    section.content.map((node) => node.content?.map((child) => child.text).join('') ?? ''),
  );

describe('automation on stored documents', () => {
  it('DOCE-AUTOMATION-1.1 gives each element its section and the number its template gives it', () => {
    const { stored: file, template } = storedFixture('roman-and-alpha-numbering');
    const blocks = describeDocument(file, { schema, template }).blocks;
    const numbered = blocks.filter((block) => block.number).slice(0, 5);
    expect(numbered.map(({ text, section, number }) => [text, section, number])).toEqual([
      ['Preface', 0, 'i.'],
      ['Acknowledgements', 0, 'ii.'],
      ['Volunteers', 0, 'ii.a'],
      ['Chapter 1', 1, 'I.'],
      ['Overview', 1, 'I.1'],
    ]);
    expect(blocks.find((block) => block.type === 'paragraph')?.number).toBe('');
    const plain = describeDocument(file, { schema }).blocks;
    expect(plain.every((block) => block.number === '')).toBe(true);
  });

  it('DOCE-AUTOMATION-4.1 describes a stored document with its revision, sections and problems', () => {
    const { stored: file, template } = storedFixture('locked-sections');
    const description = describeDocument(file, { schema, template });
    expect(description.revision).toBe('r1');
    expect(description.template).toEqual(file.content.template);
    expect(description.sections.map(({ name, editable }) => [name, editable])).toEqual([
      ['notice', false],
      ['summary', true],
      ['body', true],
      ['notes', true],
      ['sign_off', false],
    ]);
    const unknown = describeDocument(
      stored(paragraph('a1a1a1a1', 'Kept'), { type: 'sundial', attrs: { id: 'b2b2b2b2' } }),
      { schema },
    );
    expect(unknown.blocks.map((block) => block.text)).toEqual(['Kept']);
    expect(unknown.problems).toEqual([expect.objectContaining({ kept: true })]);
  });

  it('DOCE-AUTOMATION-4.2 makes a batch to a stored document and returns its new content', () => {
    const file = stored(
      paragraph('a1a1a1a1', 'The log keeps a report.'),
      paragraph('b2b2b2b2', 'B'),
    );
    const result = applyStoredEdits(
      file,
      [
        {
          op: 'replaceText',
          at: { elementId: 'a1a1a1a1', from: 16, to: 22, expect: 'report' },
          text: 'record',
        },
        {
          op: 'insertBlocks',
          after: 'a1a1a1a1',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Added' }] }],
        },
        { op: 'comment', at: { elementId: 'b2b2b2b2' }, text: 'Check this' },
      ],
      AGENT,
    );
    if (!result.ok) throw new Error(result.error.message);
    expect(result.baseRevision).toBe('r1');
    expect(texts(result.content)).toEqual(['The log keeps a record.', 'Added', 'B']);
    const added = result.content.sections[0]?.content[1];
    expect(added?.attrs).toMatchObject({ id: expect.stringMatching(/^[0-9a-f]{8}$/) });
    expect(added?.attrs?.author).toBe('agent-1');
    expect(result.content.sections[0]?.content[0]?.content?.[1]).toEqual({
      type: 'text',
      text: 'record',
      marks: [{ type: 'contributor', attrs: { author: 'agent-1', aiSession: 's1' } }],
    });
    expect(result.threads).toEqual([
      expect.objectContaining({ quote: 'B', text: 'Check this', actor: AGENT.actor }),
    ]);
    // The stored content it was given is left as it was.
    expect(texts(file.content)).toEqual(['The log keeps a report.', 'B']);
  });

  it('DOCE-AUTOMATION-4.2 records a stored batch as suggestions by the actor', () => {
    const result = applyStoredEdits(
      stored(paragraph('a1a1a1a1', 'Alpha')),
      [{ op: 'insertText', at: { elementId: 'a1a1a1a1' }, text: ' beta' }],
      { ...AGENT, mode: 'suggest' },
    );
    if (!result.ok) throw new Error(result.error.message);
    const doc = readDocumentFile(result.content, schema).doc;
    expect(listSuggestions(doc)).toEqual([
      expect.objectContaining({ author: 'agent-1', inserted: ' beta', deleted: '' }),
    ]);
  });

  it('DOCE-AUTOMATION-4.3 refuses a batch made against another revision as a conflict', () => {
    const file = { ...stored(paragraph('a1a1a1a1', 'Alpha')), revision: 'r2' };
    const edits = [
      { op: 'replaceText', at: { elementId: 'a1a1a1a1', expect: 'Alpha' }, text: 'Beta' },
    ] as const;
    expect(applyStoredEdits(file, edits, AGENT)).toEqual({
      ok: false,
      error: { kind: 'conflict', revision: 'r2', message: expect.any(String) },
    });
    const read = describeDocument(file, { schema });
    const result = applyStoredEdits(file, edits, { ...AGENT, revision: read.revision });
    expect(result.ok && texts(result.content)).toEqual(['Beta']);
  });

  it('DOCE-AUTOMATION-4.4 refuses edits in sections that may not be edited and at host locks', () => {
    const { stored: file, template } = storedFixture('section-settings');
    const options = { ...AGENT, template };
    const body = describeDocument(file, { schema, template }).blocks.find(
      (block) => block.section === 1 && block.type === 'paragraph',
    );
    if (!body) throw new Error('No paragraph in the locked section');
    const edit = { op: 'insertText', at: { elementId: body.elementId }, text: '!' } as const;
    expect(applyStoredEdits(file, [edit], options)).toMatchObject({
      ok: false,
      error: { kind: 'locked', index: 0 },
    });
    const cover = { op: 'insertText', at: { elementId: '5e5e0002' }, text: '!' } as const;
    expect(applyStoredEdits(file, [cover], options).ok).toBe(true);
    expect(applyStoredEdits(file, [cover], { ...options, isLocked: () => true })).toMatchObject({
      ok: false,
      error: { kind: 'locked' },
    });
  });
});
