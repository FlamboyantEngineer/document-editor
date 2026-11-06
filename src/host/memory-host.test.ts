import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FULL_CAPABILITIES } from './capabilities.js';
import { createMemoryHost } from './memory-host.js';

const CONTENT = { type: 'doc', content: [{ type: 'paragraph' }] };

describe('createMemoryHost', () => {
  it('DOCE-HOST-1.1 DOCE-HOST-3.1 is a complete host with a default reader', async () => {
    const host = createMemoryHost();
    expect(host.identity.currentPerson()).toEqual({ id: 'reader', name: 'Reader' });
    await expect(host.permissions.capabilities('any')).resolves.toEqual(FULL_CAPABILITIES);
    expect(host.templates).toBeDefined();
    expect(host.assets).toBeDefined();
    expect(host.feedback).toBeUndefined();
  });

  it('DOCE-HOST-1.2 resolves a missing document to a not-found result', async () => {
    const result = await createMemoryHost().documents.load('missing');
    expect(result).toMatchObject({ ok: false, error: { kind: 'not-found' } });
  });

  it('DOCE-HOST-1.3 accepts a save on the stored revision and refuses a stale one', async () => {
    const { documents } = createMemoryHost({ documents: [{ id: 'a', content: CONTENT }] });
    const first = await documents.save('a', { content: CONTENT, baseRevision: '1' });
    expect(first).toEqual({ ok: true, value: { revision: '2' } });
    const stale = await documents.save('a', { content: CONTENT, baseRevision: '1' });
    expect(stale).toEqual({ ok: false, error: { kind: 'conflict' } });
    await expect(documents.load('a')).resolves.toMatchObject({ value: { revision: '2' } });
  });

  it('DOCE-HOST-3.2 returns copies and shares nothing between hosts', async () => {
    const options = { documents: [{ id: 'a', content: CONTENT }] };
    const host = createMemoryHost(options);
    const loaded = await host.documents.load('a');
    if (!loaded.ok) throw new Error('The document should load.');
    (loaded.value.content as { type: string }).type = 'changed';
    await expect(host.documents.load('a')).resolves.toMatchObject({ value: { content: CONTENT } });

    await host.documents.save('a', { content: { type: 'doc' }, baseRevision: '1' });
    const other = await createMemoryHost(options).documents.load('a');
    expect(other).toMatchObject({ value: { revision: '1', content: CONTENT } });
  });

  it('DOCE-HOST-3.2 returns template copies', async () => {
    const host = createMemoryHost({ templates: [{ id: 't', payload: { name: 'Report' } }] });
    const first = await host.templates?.load('t');
    if (!first?.ok) throw new Error('The template should load.');
    (first.value.payload as { name: string }).name = 'Changed';
    await expect(host.templates?.load('t')).resolves.toMatchObject({
      value: { payload: { name: 'Report' } },
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

  it('DOCE-HOST-1.4 keeps library source away from browser storage', () => {
    const config = readFileSync(join(process.cwd(), 'eslint.config.js'), 'utf8');
    expect(config).toContain("'localStorage', 'sessionStorage'");
  });
});
