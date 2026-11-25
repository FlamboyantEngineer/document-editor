// The template workspace over the in-memory host's template store: open a template from the
// folders the lab keeps in `extensions.folder`, edit its scopes from their tabs, save it, save it
// as a copy into a folder, delete it, and browse and restore its versions, with the workspace's own
// preview of the tab shown beside the side panel, whose image button places the lab's badge. The
// Article template is for the web layout, which the lab keeps in the template's own
// `extensions.layout`, so it previews as the web layout shows a document, with its margins in
// pixels; it inherits nothing, keeps its name, and is pinned first in the open dialog. "Save elsewhere" saves the open template as another writer would, so the next
// save meets a conflict. "Show the stored template" shows the open template as the store holds it.

import { LockGlyph } from '@flamboyantengineer/ui-components/core';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TemplateWorkspace } from '../../src/components/index.js';
import { type AssetAdapter, createMemoryHost } from '../../src/host/index.js';
import type { TemplateFile } from '../../src/model/index.js';
import { markReadyWhenSettled } from './lab-ready.js';
import { LAB_FONTS } from './served-fonts.js';

const TEMPLATES: TemplateFile[] = [
  { formatVersion: 1, id: 'report', name: 'Report' },
  {
    formatVersion: 1,
    id: 'report',
    name: 'Report',
    styles: { heading1: { color: '#1d4ed8' } },
  },
  {
    formatVersion: 1,
    id: 'letter',
    name: 'Letter',
    parent: 'report',
    page: { size: 'US Letter' },
    sections: [{ name: 'cover', label: 'Cover page' }, { name: 'body' }],
    extensions: { folder: 'Outgoing/Mail' },
  },
  {
    formatVersion: 1,
    id: 'article',
    name: 'Article',
    page: { margins: { top: '24px', right: '24px', bottom: '24px', left: '24px' } },
    styles: { paragraph: { font: 'Arial', size: '15px', lineHeight: 1.6 } },
    extensions: { layout: 'web' },
  },
];

const host = createMemoryHost({ templates: TEMPLATES });
const { templates: store } = host;

// A badge the preview's image button places in a header, a footer or a section's content.
const BADGE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="32"><rect width="96" height="32" rx="6" fill="#1d4ed8"/><text x="48" y="21" fill="#fff" font-family="sans-serif" font-size="14" text-anchor="middle">Badge</text></svg>',
)}`;
const assets: AssetAdapter = {
  upload: () => Promise.resolve({ ok: false, error: { kind: 'unavailable' } }),
  search: (query) =>
    Promise.resolve({
      ok: true,
      value: {
        items: 'badge'.includes(query.toLowerCase())
          ? [
              {
                id: 'badge',
                name: 'Badge',
                url: BADGE,
                mediaType: 'image/svg+xml',
                width: 96,
                height: 32,
              },
            ]
          : [],
      },
    }),
  resolveUrl: (id) => (id === 'badge' ? BADGE : ''),
};

// The folders of the stored templates, by id, read again after each save.
const folders = new Map<string, readonly string[]>();
async function readFolders() {
  const listed = await store.list();
  if (!listed.ok) return;
  for (const summary of listed.value) {
    const loaded = await store.load(summary.id);
    const folder = loaded.ok ? loaded.value.template.extensions?.folder : undefined;
    folders.set(summary.id, typeof folder === 'string' && folder ? folder.split('/') : []);
  }
}

function Lab() {
  const [openId, setOpenId] = useState<string | null>('report');
  const [, setRead] = useState(0);
  const [stored, setStored] = useState<string | null>(null);
  const showStored = async () => {
    if (!openId) return;
    const loaded = await store.load(openId);
    setStored(loaded.ok ? JSON.stringify(loaded.value.template, null, 2) : null);
  };
  useEffect(() => {
    void readFolders().then(() => setRead((count) => count + 1));
  }, [openId]);
  const saveElsewhere = async () => {
    if (!openId) return;
    const loaded = await store.load(openId);
    if (!loaded.ok) return;
    const { template, revision } = loaded.value;
    await store.save(openId, {
      template: { ...template, name: `${template.name ?? openId} (saved elsewhere)` },
      baseRevision: revision,
    });
  };
  return (
    <>
      <p>
        <button type="button" onClick={() => void saveElsewhere()}>
          Save elsewhere
        </button>{' '}
        <button type="button" onClick={() => void showStored()}>
          Show the stored template
        </button>
      </p>
      <TemplateWorkspace
        store={store}
        pageFonts={LAB_FONTS}
        defaultTemplateId="report"
        onTemplateIdChange={setOpenId}
        layoutOf={(template) => (template.extensions?.layout === 'web' ? 'web' : 'page')}
        isRoot={(template) => template.id === 'article'}
        isNameReadOnly={(template) => template.id === 'article'}
        catalog={{
          pinned: ['article'],
          iconOf: (template) => (template.id === 'article' ? LockGlyph : undefined),
          pathOf: (template) => folders.get(template.id) ?? [],
        }}
        saveAsFields={(copy, onChange) => (
          <label>
            Folder{' '}
            <input
              value={String(copy.extensions?.folder ?? '')}
              onChange={(event) =>
                onChange({
                  ...copy,
                  extensions: { ...copy.extensions, folder: event.target.value },
                })
              }
            />
          </label>
        )}
        canDelete
        personOf={(author) => ({ name: author === 'me' ? 'You' : author })}
        assets={assets}
        extensions={{
          rows: {
            identity: [
              { id: 'layout', label: 'Layout', path: ['layout'], kind: { type: 'text' } },
              { id: 'folder', label: 'Folder', path: ['folder'], kind: { type: 'text' } },
            ],
          },
        }}
        className="lab-template-workspace"
      />
      {stored === null ? null : <pre aria-label="Stored template">{stored}</pre>}
    </>
  );
}

const container = document.querySelector('#lab-editor');
if (container) {
  createRoot(container).render(<Lab />);
  markReadyWhenSettled();
}
