import type { EditorState } from 'prosemirror-state';
import { describe, expect, it, vi } from 'vitest';
import type { DocumentVersion, EditorHost } from '../host/adapters.js';
import { createMemoryHost } from '../host/memory-host.js';
import type { DocumentFile } from '../model/format/document-format.js';
import type { TemplateFile } from '../model/format/template-format.js';
import { BASE_TEMPLATE } from '../model/templates/base-template.js';
import { createDocumentSession, type DocumentSession } from './document-session.js';
import { groupVersions } from './version-groups.js';
import { createDocumentVersions, type DocumentVersions } from './versions.js';

const paragraph = (text: string): DocumentFile => ({
  formatVersion: 1,
  sections: [
    {
      name: null,
      content: [
        { type: 'paragraph', attrs: { id: 'a0000001' }, content: [{ type: 'text', text }] },
      ],
    },
  ],
});

const TEMPLATE: TemplateFile = {
  formatVersion: BASE_TEMPLATE.formatVersion,
  id: 'report',
  name: 'Report',
};

const version = (sequence: number, label: string | null = null): DocumentVersion => ({
  revision: `rev-${String(sequence)}`,
  sequence,
  savedAt: '2026-01-01T00:00:00.000Z',
  author: null,
  label,
});

const textOf = (state: EditorState) => state.doc.textContent;

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function openWithVersions(host: EditorHost = hostWith()) {
  const session = createDocumentSession({
    host,
    documentId: 'doc',
    mode: 'store',
    autosaveDelay: 0,
  });
  await session.ready;
  const versions = createDocumentVersions<string>({ host, session });
  await settle();
  return { host, session, versions };
}

function hostWith() {
  return createMemoryHost({ documents: [{ id: 'doc', content: paragraph('First') }] });
}

// Types after the first character of the document's text.
function typeText(session: DocumentSession, text: string) {
  session.update((state: EditorState) => {
    let at = -1;
    state.doc.descendants((node, pos) => {
      if (at < 0 && node.isText) at = pos + 1;
      return at < 0;
    });
    return state.apply(state.tr.insertText(text, at));
  });
}

const labels = (versions: DocumentVersions<string>) =>
  versions.list.get().versions.map(({ label }) => label);

describe('groupVersions', () => {
  it('DOCE-VERSIONS-4.2 folds automatic versions under the named version after them', () => {
    const groups = groupVersions([
      version(6),
      version(5, 'Final'),
      version(4),
      version(3),
      version(2, 'Draft'),
      version(1),
    ]);
    expect(
      groups.map((group) => [group.version.revision, group.folded.map((each) => each.revision)]),
    ).toEqual([
      ['rev-6', []],
      ['rev-5', ['rev-4', 'rev-3']],
      ['rev-2', ['rev-1']],
    ]);
    expect(groupVersions([version(2), version(1)]).map((group) => group.folded)).toEqual([[], []]);
  });
});

describe('createDocumentVersions', () => {
  it('DOCE-VERSIONS-4.1 lists the versions and follows their changes until closed', async () => {
    const { host, versions } = await openWithVersions();
    expect(versions.list.get()).toMatchObject({
      status: 'ready',
      versions: [{ revision: 'rev-1' }],
    });
    await host.documents.save('doc', { content: paragraph('Second'), baseRevision: 'rev-1' });
    await settle();
    expect(versions.list.get().versions.map(({ revision }) => revision)).toEqual([
      'rev-2',
      'rev-1',
    ]);
    versions.close();
    await host.documents.save('doc', { content: paragraph('Third'), baseRevision: 'rev-2' });
    await settle();
    expect(versions.list.get().versions).toHaveLength(2);
  });

  it('DOCE-VERSIONS-4.1 reports a list that fails', async () => {
    const host = hostWith();
    host.memory.failNext('versions.list', { kind: 'unavailable', message: 'Offline' });
    const { versions } = await openWithVersions(host);
    expect(versions.list.get()).toMatchObject({ status: 'failed', error: { message: 'Offline' } });
  });

  it('DOCE-VERSIONS-4.3 keeps the changes, then names the saved state as a version', async () => {
    const { host, session, versions } = await openWithVersions();
    typeText(session, 'X');
    const saved = await versions.saveVersion('Reviewed');
    expect(saved).toMatchObject({ ok: true, value: { revision: 'rev-2', label: 'Reviewed' } });
    expect(labels(versions)).toEqual(['Reviewed', null]);
    // The session still saves against the latest revision.
    typeText(session, 'Y');
    await session.save();
    expect(session.status.get().error).toBeNull();
    const loaded = await host.documents.load('doc');
    expect(loaded.ok && loaded.value.revision).toBe('rev-3');
  });

  it('DOCE-VERSIONS-4.3 lets the hook change or cancel a version', async () => {
    const host = hostWith();
    const session = createDocumentSession({ host, documentId: 'doc', mode: 'store' });
    await session.ready;
    const beforeVersion = vi.fn((made: { content: DocumentFile; label: string | null }) =>
      made.label === 'Skip' ? null : { ...made, label: `${made.label ?? ''} (checked)` },
    );
    const versions = createDocumentVersions({ host, session, beforeVersion });
    await expect(versions.saveVersion('Skip')).resolves.toMatchObject({ ok: false });
    await expect(versions.saveVersion('Final')).resolves.toMatchObject({
      value: { label: 'Final (checked)' },
    });
    expect(beforeVersion).toHaveBeenCalledTimes(2);
  });

  it('DOCE-VERSIONS-4.4 renames a version', async () => {
    const { versions } = await openWithVersions();
    await versions.rename('rev-1', 'Start');
    expect(labels(versions)).toEqual(['Start']);
    await versions.rename('rev-1', null);
    expect(labels(versions)).toEqual([null]);
  });

  it('DOCE-VERSIONS-4.5 restores a version as an edit, with its template, and saves it', async () => {
    const host = createMemoryHost({
      templates: [TEMPLATE],
      documents: [{ id: 'doc', content: { ...paragraph('First'), template: { id: 'report' } } }],
    });
    const { session, versions } = await openWithVersions(host);
    typeText(session, 'X');
    await session.setTemplate(null);
    await session.save();
    await expect(versions.restore('rev-1')).resolves.toMatchObject({ ok: true });
    const shown = session.document.get();
    expect(shown && textOf(shown.state)).toBe('First');
    expect(shown?.pin).toEqual({ id: 'report' });
    const loaded = await host.documents.load('doc');
    expect(loaded.ok && loaded.value.content.template).toEqual({ id: 'report' });
  });

  it('DOCE-VERSIONS-5.1 shows a version with the template it pins, read-only, until return', async () => {
    const host = createMemoryHost({
      templates: [TEMPLATE],
      documents: [{ id: 'doc', content: { ...paragraph('First'), template: { id: 'report' } } }],
    });
    const { session, versions } = await openWithVersions(host);
    await session.setTemplate(null);
    typeText(session, 'X');
    await session.save();
    await versions.refresh();
    const shown = await versions.viewVersion('rev-1', { returnTo: 'suggesting, markup all' });
    expect(shown.ok).toBe(true);
    const view = versions.view.get();
    expect(view && textOf(view.version.state)).toBe('First');
    expect(view?.version.pin).toEqual({ id: 'report' });
    expect(view?.version.template.id).toBe('report');
    versions.updateView((state) => state.apply(state.tr.setMeta('look', true)));
    expect(versions.view.get()?.version.state).not.toBe(view?.version.state);
    expect(versions.returnFromView()).toBe('suggesting, markup all');
    expect(versions.view.get()).toBeNull();
    expect(versions.returnFromView()).toBeNull();
  });

  it('DOCE-VERSIONS-5.2 DOCE-VERSIONS-5.3 compares two versions and keeps the first return', async () => {
    const { host, versions } = await openWithVersions();
    await host.documents.save('doc', { content: paragraph('Second'), baseRevision: 'rev-1' });
    await settle();
    await versions.viewVersion('rev-1', { returnTo: 'before' });
    await versions.viewVersion('rev-2', { returnTo: 'during', compareWith: 'rev-1' });
    const view = versions.view.get();
    expect(view && textOf(view.version.state)).toBe('Second');
    expect(view?.previous && textOf(view.previous.state)).toBe('First');
    expect(versions.returnFromView()).toBe('before');
    await expect(versions.viewVersion('rev-9', { returnTo: 'x' })).resolves.toMatchObject({
      ok: false,
      error: { kind: 'not-found' },
    });
  });
});
