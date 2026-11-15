import { describe, expect, it, vi } from 'vitest';
import { createMemoryHost } from '../host/memory-host.js';
import type { DocumentFile } from '../model/format/document-format.js';
import type { TemplateFile } from '../model/format/template-format.js';
import { createDocumentSession } from './document-session.js';
import { createDocumentVersions } from './versions.js';

const documentWith = (template: DocumentFile['template']): DocumentFile => ({
  formatVersion: 1,
  template,
  sections: [
    { name: null, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Captured' }] }] },
  ],
});
const template = (id: string, top: string): TemplateFile => ({
  formatVersion: 1,
  id,
  page: { margins: { top } },
});

async function changedTemplates(parent: string) {
  const leaf: TemplateFile = {
    formatVersion: 1,
    id: 'leaf',
    ...(parent === 'base' ? {} : { parent }),
    page: { margins: { left: '12mm' } },
  };
  const content = documentWith({ id: 'leaf' });
  const host = createMemoryHost({
    documents: [{ id: 'doc', content }],
    templates: [template(parent, '11mm'), leaf],
  });
  await host.templates.save(parent, { template: template(parent, '33mm'), baseRevision: 'rev-1' });
  await host.templates.save('leaf', {
    template: { ...leaf, page: { margins: { left: '22mm' } } },
    baseRevision: 'rev-1',
  });
  return { host, content };
}

describe('resolved historical templates', () => {
  it.each(['parent', 'base'])(
    'DOCE-VERSIONS-5.5 captures the leaf and inherited %s before the first historical read',
    async (parent) => {
      const { host } = await changedTemplates(parent);
      const session = createDocumentSession({ host, documentId: 'doc', mode: 'store' });
      await session.ready;
      expect(session.document.get()?.template.page?.margins).toMatchObject({
        top: '33mm',
        left: '22mm',
      });
      const versions = createDocumentVersions({ host, session });
      await versions.refresh();
      const load = vi.spyOn(host.templates, 'load');
      try {
        const viewed = await versions.viewVersion('rev-1', { returnTo: null });
        if (!viewed.ok) throw new Error('No historical view.');
        expect(viewed.value.version.template.page?.margins).toMatchObject({
          top: '11mm',
          left: '12mm',
        });
        expect(load).not.toHaveBeenCalled();
        const snapshot = await host.versions?.loadSnapshot?.('doc', 'rev-1');
        expect(snapshot).toMatchObject({
          value: { template: { page: { margins: { top: '11mm', left: '12mm' } } } },
        });
      } finally {
        versions.close();
        session.close();
      }
    },
  );

  it('DOCE-VERSIONS-5.5 allocates a new named revision when only the resolved inherited template changed', async () => {
    const content = documentWith({ id: 'leaf' });
    const host = createMemoryHost({
      documents: [{ id: 'doc', content }],
      templates: [template('parent', '11mm'), { formatVersion: 1, id: 'leaf', parent: 'parent' }],
    });
    const first = await host.versions?.create?.('doc', { content, label: 'Before' });
    expect(first).toMatchObject({ value: { revision: 'rev-1' } });
    await host.templates.save('parent', {
      template: template('parent', '33mm'),
      baseRevision: 'rev-1',
    });
    const second = await host.versions?.create?.('doc', { content, label: 'After' });
    expect(second).toMatchObject({ value: { revision: 'rev-2' } });
    expect(await host.versions?.loadSnapshot?.('doc', 'rev-1')).toMatchObject({
      value: { template: { page: { margins: { top: '11mm' } } } },
    });
    expect(await host.versions?.loadSnapshot?.('doc', 'rev-2')).toMatchObject({
      value: { template: { page: { margins: { top: '33mm' } } } },
    });
  });

  it('DOCE-VERSIONS-5.5 retains recorded capture failures instead of resolving a template added later', async () => {
    const content = documentWith({ id: 'missing' });
    const host = createMemoryHost({ documents: [{ id: 'doc', content }] });
    const before = await host.versions?.list('doc');
    await expect(
      host.versions?.create?.('doc', { content, label: 'Unavailable' }),
    ).resolves.toMatchObject({ error: { kind: 'not-found' } });
    expect(await host.versions?.list('doc')).toEqual(before);
    await host.templates.create(template('missing', '33mm'));
    await expect(host.versions?.loadSnapshot?.('doc', 'rev-1')).resolves.toMatchObject({
      error: { kind: 'not-found' },
    });
  });

  it('DOCE-VERSIONS-5.5 keeps live unversioned loading and content-only historical fallback explicit', async () => {
    const { host } = await changedTemplates('parent');
    if (!host.versions) throw new Error('No versions.');
    const { loadSnapshot: _, ...legacy } = host.versions;
    const session = createDocumentSession({ host, documentId: 'doc', mode: 'store' });
    await session.ready;
    const versions = createDocumentVersions({ host: { ...host, versions: legacy }, session });
    await versions.refresh();
    try {
      const viewed = await versions.viewVersion('rev-1', { returnTo: null });
      if (!viewed.ok) throw new Error('No legacy historical view.');
      expect(viewed.value.version.template.page?.margins).toMatchObject({
        top: '33mm',
        left: '22mm',
      });
    } finally {
      versions.close();
      session.close();
    }
  });
  it('DOCE-VERSIONS-5.5 captures automatic saves synchronously and returns detached resolved templates', async () => {
    const content = documentWith({ id: 'leaf', revision: 'rev-1' });
    const host = createMemoryHost({
      documents: [{ id: 'doc', content }],
      templates: [template('parent', '11mm'), { formatVersion: 1, id: 'leaf', parent: 'parent' }],
    });
    await host.documents.save('doc', { content, baseRevision: 'rev-1' });
    await host.templates.save('parent', {
      template: template('parent', '33mm'),
      baseRevision: 'rev-1',
    });
    const captured = await host.versions?.loadSnapshot?.('doc', 'rev-2');
    if (!captured?.ok) throw new Error('No automatic snapshot.');
    expect(captured.value.template.page?.margins?.top).toBe('11mm');
    const margins = captured.value.template.page?.margins;
    if (margins) margins.top = '99mm';
    expect(await host.versions?.loadSnapshot?.('doc', 'rev-2')).toMatchObject({
      value: { template: { page: { margins: { top: '11mm' } } } },
    });
  });

  it('DOCE-VERSIONS-5.5 restores the original pin with live resolution without claiming captured presentation restore', async () => {
    const { host } = await changedTemplates('parent');
    await expect(host.versions?.restore?.('doc', 'rev-1')).resolves.toMatchObject({
      ok: true,
      value: { revision: 'rev-2' },
    });
    expect(await host.documents.load('doc')).toMatchObject({
      value: { content: { template: { id: 'leaf' } } },
    });
    expect(await host.versions?.loadSnapshot?.('doc', 'rev-1')).toMatchObject({
      value: { template: { page: { margins: { top: '11mm', left: '12mm' } } } },
    });
    expect(await host.versions?.loadSnapshot?.('doc', 'rev-2')).toMatchObject({
      value: { template: { page: { margins: { top: '33mm', left: '22mm' } } } },
    });
  });
});
