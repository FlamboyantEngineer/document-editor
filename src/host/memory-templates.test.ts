import { describe, expect, it, vi } from 'vitest';
import type { TemplateFile } from '../model/index.js';
import { createMemoryHost } from './memory-host.js';

const REPORT: TemplateFile = { formatVersion: 1, id: 'report', name: 'Report' };
const LETTER: TemplateFile = { formatVersion: 1, id: 'letter', name: 'Letter', parent: 'report' };

const hostWith = (...templates: TemplateFile[]) =>
  createMemoryHost({ templates, now: () => new Date('2026-01-02T03:04:05Z') });

describe('createMemoryHost templates', () => {
  it('DOCE-HOST-1.22 DOCE-HOST-3.11 lists the stored templates at their latest revisions', async () => {
    const { templates } = hostWith(REPORT, LETTER, { ...REPORT, name: 'Report 2' });
    await expect(templates.list()).resolves.toEqual({
      ok: true,
      value: [
        { id: 'report', name: 'Report 2', parent: null, revision: 'rev-2', sequence: 2 },
        { id: 'letter', name: 'Letter', parent: 'report', revision: 'rev-1', sequence: 1 },
      ],
    });
  });

  it('DOCE-HOST-1.22 DOCE-HOST-3.11 saves on the stored revision and refuses a stale one', async () => {
    const { templates } = hostWith(REPORT);
    const onSaved = vi.fn();
    templates.subscribe?.('report', onSaved);
    const saved = await templates.save('report', {
      template: { ...REPORT, name: 'Renamed' },
      baseRevision: 'rev-1',
    });
    expect(saved).toEqual({ ok: true, value: { revision: 'rev-2', sequence: 2 } });
    expect(onSaved).toHaveBeenCalledWith({ revision: 'rev-2', sequence: 2 });
    const stale = await templates.save('report', { template: REPORT, baseRevision: 'rev-1' });
    expect(stale).toMatchObject({ ok: false, error: { kind: 'conflict' } });
    await expect(templates.load('report')).resolves.toMatchObject({
      value: { revision: 'rev-2', template: { name: 'Renamed' } },
    });
    await expect(
      templates.save('missing', { template: REPORT, baseRevision: 'rev-1' }),
    ).resolves.toMatchObject({ ok: false, error: { kind: 'not-found' } });
  });

  it('DOCE-HOST-1.22 DOCE-HOST-3.11 creates a template under a free id only', async () => {
    const { templates } = hostWith(REPORT);
    await expect(templates.create({ ...REPORT, id: 'copy' })).resolves.toEqual({
      ok: true,
      value: { revision: 'rev-1', sequence: 1 },
    });
    await expect(templates.load('copy')).resolves.toMatchObject({
      value: { template: { id: 'copy' } },
    });
    await expect(templates.create(REPORT)).resolves.toMatchObject({
      ok: false,
      error: { kind: 'conflict' },
    });
  });

  it('DOCE-HOST-1.22 DOCE-HOST-3.11 removes a template no other inherits', async () => {
    const { templates } = hostWith(REPORT, LETTER);
    await expect(templates.remove('report')).resolves.toMatchObject({
      ok: false,
      error: { kind: 'denied' },
    });
    await expect(templates.remove('letter')).resolves.toEqual({ ok: true, value: null });
    await expect(templates.load('letter')).resolves.toMatchObject({ error: { kind: 'not-found' } });
    await expect(templates.remove('report')).resolves.toEqual({ ok: true, value: null });
    await expect(templates.remove('report')).resolves.toMatchObject({
      error: { kind: 'not-found' },
    });
  });

  it('DOCE-HOST-1.22 DOCE-HOST-3.11 lists a template versions newest first, each loadable', async () => {
    const { templates } = hostWith(REPORT, { ...REPORT, name: 'Second' });
    await expect(templates.versions?.('report')).resolves.toEqual({
      ok: true,
      value: [
        { revision: 'rev-2', sequence: 2, savedAt: '2026-01-02T03:04:05.000Z', author: 'reader' },
        { revision: 'rev-1', sequence: 1, savedAt: '2026-01-02T03:04:05.000Z', author: 'reader' },
      ],
    });
    await expect(templates.load('report', { revision: 'rev-1' })).resolves.toMatchObject({
      value: { template: { name: 'Report' } },
    });
    await expect(templates.versions?.('missing')).resolves.toMatchObject({
      error: { kind: 'not-found' },
    });
  });
});
