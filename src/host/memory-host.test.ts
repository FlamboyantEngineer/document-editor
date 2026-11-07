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

  it('DOCE-HOST-1.4 keeps library source away from browser storage', () => {
    const config = readFileSync(join(process.cwd(), 'eslint.config.js'), 'utf8');
    expect(config).toContain("'localStorage', 'sessionStorage'");
  });
});
