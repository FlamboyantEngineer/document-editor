import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DocumentFile } from '../model/index.js';
import type { CommentThread } from './adapters.js';
import { FULL_CAPABILITIES } from './capabilities.js';
import { createMemoryHost } from './memory-host.js';

const CONTENT: DocumentFile = {
  formatVersion: 1,
  sections: [{ content: [{ type: 'paragraph' }] }],
};

describe('createMemoryHost', () => {
  it('DOCE-HOST-1.1 DOCE-HOST-3.1 is a complete host with a default reader', async () => {
    const host = createMemoryHost();
    expect(host.identity.currentPerson()).toEqual({ id: 'reader', name: 'Reader' });
    await expect(host.permissions.capabilities('any')).resolves.toEqual(FULL_CAPABILITIES);
    expect(host.templates).toBeDefined();
    expect(host.assets).toBeDefined();
    expect(host.comments).toBeDefined();
    expect(host.feedback).toBeUndefined();
  });

  it('DOCE-HOST-1.2 resolves a missing document to a not-found result', async () => {
    const result = await createMemoryHost().documents.load('missing');
    expect(result).toMatchObject({ ok: false, error: { kind: 'not-found' } });
  });

  it('DOCE-HOST-1.3 accepts a save on the stored revision and refuses a stale one', async () => {
    const { documents } = createMemoryHost({ documents: [{ id: 'a', content: CONTENT }] });
    const first = await documents.save('a', { content: CONTENT, baseRevision: 'rev-1' });
    expect(first).toEqual({ ok: true, value: { revision: 'rev-2', sequence: 2 } });
    const stale = await documents.save('a', { content: CONTENT, baseRevision: 'rev-1' });
    expect(stale).toEqual({ ok: false, error: { kind: 'conflict' } });
    await expect(documents.load('a')).resolves.toMatchObject({
      value: { revision: 'rev-2', sequence: 2 },
    });
  });

  it('DOCE-HOST-3.2 returns copies and shares nothing between hosts', async () => {
    const options = { documents: [{ id: 'a', content: CONTENT }] };
    const host = createMemoryHost(options);
    const loaded = await host.documents.load('a');
    if (!loaded.ok) throw new Error('The document should load.');
    loaded.value.content.sections = [];
    await expect(host.documents.load('a')).resolves.toMatchObject({ value: { content: CONTENT } });

    await host.documents.save('a', {
      content: { formatVersion: 1, sections: [] },
      baseRevision: 'rev-1',
    });
    const other = await createMemoryHost(options).documents.load('a');
    expect(other).toMatchObject({ value: { revision: 'rev-1', content: CONTENT } });
  });

  it('DOCE-HOST-3.2 returns template copies', async () => {
    const host = createMemoryHost({ templates: [{ formatVersion: 1, id: 't', name: 'Report' }] });
    const first = await host.templates?.load('t');
    if (!first?.ok) throw new Error('The template should load.');
    first.value.template.name = 'Changed';
    await expect(host.templates?.load('t')).resolves.toMatchObject({
      value: { template: { name: 'Report' }, revision: 'rev-1', sequence: 1 },
    });
  });

  it('DOCE-TEMPLATES-11.2 loads the revision a document pins, or the latest', async () => {
    const host = createMemoryHost({
      templates: [
        { formatVersion: 1, id: 't', name: 'First' },
        { formatVersion: 1, id: 't', name: 'Second' },
      ],
    });
    await expect(host.templates?.load('t')).resolves.toMatchObject({
      value: { template: { name: 'Second' }, revision: 'rev-2' },
    });
    await expect(host.templates?.load('t', { revision: 'rev-1' })).resolves.toMatchObject({
      value: { template: { name: 'First' }, revision: 'rev-1' },
    });
    await expect(host.templates?.load('t', { revision: 'rev-9' })).resolves.toMatchObject({
      ok: false,
      error: { kind: 'not-found' },
    });
  });

  it('DOCE-HOST-3.3 finds and resolves people, including the reader', async () => {
    const { identity } = createMemoryHost({
      person: { id: 'p1', name: 'Ada Lovelace' },
      people: [{ id: 'p2', name: 'Grace Hopper' }],
    });
    await expect(identity.findPeople('  HOP ')).resolves.toEqual([
      { id: 'p2', name: 'Grace Hopper' },
    ]);
    await expect(identity.findPeople('a')).resolves.toHaveLength(2);
    await expect(identity.resolvePeople(['p1', 'unknown'])).resolves.toEqual([
      { id: 'p1', name: 'Ada Lovelace' },
    ]);
  });

  it('DOCE-HOST-1.5 DOCE-HOST-3.4 keeps comment threads, attributed to the reader', async () => {
    const { comments } = createMemoryHost({
      person: { id: 'p1', name: 'Ada' },
      comments: { now: () => new Date('2026-01-02T03:04:05Z') },
    });
    if (!comments) throw new Error('The host should keep comments.');
    const created = await comments.create('doc', { id: 't1', quote: 'blue', text: 'Why?' });
    expect(created).toEqual({
      ok: true,
      value: {
        id: 't1',
        state: 'open',
        quote: 'blue',
        suggestion: null,
        entries: [
          { id: 'comment-1', author: 'p1', text: 'Why?', createdAt: '2026-01-02T03:04:05.000Z' },
        ],
      },
    });
    await comments.reply('doc', 't1', 'Because.');
    await comments.setState('doc', 't1', 'resolved');
    const listed = await comments.list('doc');
    expect(listed).toMatchObject({
      value: [{ state: 'resolved', entries: [{ text: 'Why?' }, { text: 'Because.' }] }],
    });
    await expect(comments.list('other')).resolves.toEqual({ ok: true, value: [] });
  });

  it('DOCE-HOST-3.4 refuses a duplicate thread and reports a missing one', async () => {
    const { comments } = createMemoryHost();
    if (!comments) throw new Error('The host should keep comments.');
    await comments.create('doc', { id: 't1', quote: 'blue', text: 'One' });
    await expect(comments.create('doc', { id: 't1', quote: 'blue', text: 'Two' })).resolves.toEqual(
      {
        ok: false,
        error: { kind: 'conflict' },
      },
    );
    await expect(comments.reply('doc', 'missing', 'Hi')).resolves.toMatchObject({
      ok: false,
      error: { kind: 'not-found' },
    });
    await expect(comments.remove('doc', 't1')).resolves.toEqual({ ok: true, value: null });
    await expect(comments.remove('doc', 't1')).resolves.toMatchObject({ ok: false });
  });

  it('DOCE-HOST-3.2 returns comment thread copies', async () => {
    const thread: CommentThread = {
      id: 't1',
      state: 'open',
      quote: 'q',
      suggestion: null,
      entries: [],
    };
    const { comments } = createMemoryHost({ comments: { threads: { doc: [thread] } } });
    const listed = await comments?.list('doc');
    if (!listed?.ok) throw new Error('The threads should list.');
    listed.value[0]?.entries.push({ id: 'x', author: 'a', text: 'b', createdAt: '' });
    await expect(comments?.list('doc')).resolves.toMatchObject({ value: [{ entries: [] }] });
  });

  it('DOCE-HOST-1.6 DOCE-HOST-3.5 keeps each saved version, newest first', async () => {
    const host = createMemoryHost({
      person: { id: 'p1', name: 'Ada' },
      documents: [{ id: 'a', content: CONTENT }],
      now: () => new Date('2026-01-02T03:04:05Z'),
    });
    const changed: DocumentFile = { formatVersion: 1, sections: [] };
    await host.documents.save('a', { content: changed, baseRevision: 'rev-1' });
    const listed = await host.versions?.list('a');
    expect(listed).toEqual({
      ok: true,
      value: [
        {
          revision: 'rev-2',
          sequence: 2,
          savedAt: '2026-01-02T03:04:05.000Z',
          author: 'p1',
          label: null,
        },
        {
          revision: 'rev-1',
          sequence: 1,
          savedAt: '2026-01-02T03:04:05.000Z',
          author: 'p1',
          label: null,
        },
      ],
    });
    await expect(host.versions?.load('a', 'rev-1')).resolves.toEqual({ ok: true, value: CONTENT });
    await expect(host.versions?.load('a', 'rev-9')).resolves.toMatchObject({ ok: false });
    await expect(host.documents.load('a')).resolves.toMatchObject({ value: { content: changed } });
  });

  it('DOCE-HOST-1.4 keeps library source away from browser storage', () => {
    const config = readFileSync(join(process.cwd(), 'eslint.config.js'), 'utf8');
    expect(config).toContain("'localStorage', 'sessionStorage'");
  });

  it('DOCE-HOST-1.8 DOCE-HOST-3.6 resolves linked code to the lines a URL names', async () => {
    const source = ['one', 'two', 'three', 'four'].join('\n');
    const host = createMemoryHost({ code: { 'https://example.com/a.ts': source } });
    await expect(host.codeSource?.resolve('https://example.com/a.ts#L2-L3')).resolves.toEqual({
      ok: true,
      value: { code: 'two\nthree', startLine: 2 },
    });
    await expect(host.codeSource?.resolve('https://example.com/a.ts')).resolves.toMatchObject({
      ok: true,
      value: { startLine: 1 },
    });
    const missing = await host.codeSource?.resolve('https://example.com/b.ts');
    expect(missing?.ok).toBe(false);
  });

  it('DOCE-HOST-1.9 DOCE-HOST-3.7 searches, adds and resolves glossary entries and citations', async () => {
    const host = createMemoryHost({
      now: () => new Date('2026-02-01T00:00:00Z'),
      citations: [
        {
          refType: 'external-document',
          label: 'Power interface specification',
          baseline: {
            version: 1,
            documentId: 'doc-1',
            numbering: 'SPEC-1',
            title: 'Power interface specification',
            revision: null,
            revisionLabel: '',
            target: null,
            defaultLabel: 'SPEC-1',
          },
        },
      ],
    });
    const created = await host.glossary?.create({
      abbreviation: ' GSE ',
      expansion: 'Ground support equipment',
    });
    expect(created).toMatchObject({
      ok: true,
      value: { abbreviation: 'GSE', createdAt: '2026-02-01T00:00:00.000Z' },
    });
    const id = created?.ok ? created.value.id : '';
    const found = await host.glossary?.search('ground');
    expect(found?.ok && found.value.map((entry) => entry.id)).toEqual([id]);
    const resolved = await host.glossary?.resolve([id, 'missing']);
    expect(resolved?.ok && resolved.value).toHaveLength(1);
    const citations = await host.references?.search('power');
    expect(citations?.ok && citations.value.map((citation) => citation.label)).toEqual([
      'Power interface specification',
    ]);
    const current = await host.references?.resolve?.([
      { documentId: 'doc-1', targetId: null },
      { documentId: 'gone', targetId: null },
    ]);
    expect(current?.ok && current.value.map((each) => each?.numbering ?? null)).toEqual([
      'SPEC-1',
      null,
    ]);
  });

  it('DOCE-HOST-1.10 DOCE-HOST-3.8 edits, deletes and reacts to comments, telling subscribers', async () => {
    const { comments } = createMemoryHost({
      person: { id: 'p1', name: 'Ada' },
      comments: { now: () => new Date('2026-01-02T03:04:05Z') },
    });
    if (!comments?.edit || !comments.removeEntry || !comments.react || !comments.subscribe) {
      throw new Error('The host should change comments and tell subscribers.');
    }
    const seen: number[] = [];
    const stop = comments.subscribe('doc', (threads) => seen.push(threads.length));
    await comments.create('doc', { id: 't1', quote: 'blue', text: 'Why?' });
    await comments.reply('doc', 't1', 'Because.');
    const edited = await comments.edit('doc', {
      threadId: 't1',
      entryId: 'comment-2',
      text: 'So.',
    });
    expect(edited).toMatchObject({
      value: { entries: [{}, { text: 'So.', editedAt: '2026-01-02T03:04:05.000Z' }] },
    });
    const reacted = await comments.react('doc', {
      threadId: 't1',
      entryId: 'comment-1',
      emoji: '👍',
      reacted: true,
    });
    expect(reacted).toMatchObject({ value: { entries: [{ reactions: { '👍': ['p1'] } }, {}] } });
    const removed = await comments.removeEntry('doc', { threadId: 't1', entryId: 'comment-2' });
    expect(removed.ok && removed.value.entries).toHaveLength(1);
    stop();
    await comments.reply('doc', 't1', 'Unseen.');
    expect(seen).toEqual([1, 1, 1, 1, 1]);
  });
  it('DOCE-HOST-1.11 DOCE-HOST-3.9 runs scripts with the function given, a throw a failure', async () => {
    expect(createMemoryHost().scripts).toBeUndefined();
    const host = createMemoryHost({
      scriptVocabulary: [{ name: 'render', kind: 'object' }],
      checkScript: (source) => (source === 'bad' ? [{ message: 'Bad', line: 1 }] : []),
      scripts: ({ source, document }) => {
        if (source === 'fail') throw new Error('Broken');
        return [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: `${source} ${String(document.sections.length)}` }],
          },
        ];
      },
    });
    await expect(
      host.scripts?.run({ blockId: 'b', source: 'count', document: CONTENT }),
    ).resolves.toEqual({
      ok: true,
      value: [{ type: 'paragraph', content: [{ type: 'text', text: 'count 1' }] }],
    });
    await expect(
      host.scripts?.run({ blockId: 'b', source: 'fail', document: CONTENT }),
    ).resolves.toEqual({
      ok: false,
      error: { kind: 'unavailable', message: 'Broken' },
    });
    expect(host.scripts?.vocabulary).toEqual([{ name: 'render', kind: 'object' }]);
    await expect(host.scripts?.check?.('bad')).resolves.toEqual({
      ok: true,
      value: [{ message: 'Bad', line: 1 }],
    });
  });
});
