// The template workspace over the in-memory host's template store: open a template from the
// folders the lab keeps in `extensions.folder`, edit its scopes from their tabs, save it, save it
// as a copy into a folder, delete it, and browse and restore its versions, with the workspace's own
// preview of the tab shown beside the side panel, whose image button places the lab's badge. The
// Article template is for the web layout, which the lab keeps in the template's own
// `extensions.layout`, so it previews as the web layout shows a document, with its margins in
// pixels; it inherits nothing, keeps its name, and is pinned first in the open dialog. "Save elsewhere" saves the open template as another writer would, so the next
// save meets a conflict. "Show the stored template" shows the open template as the store holds it.
//
// Host options: the host may hold the template open and the version shown, as a route would
// (`templateId`, `revision`, `onTemplateIdChange`, `onRevisionChange`), picked with a template
// picker of its own (`TemplatePicker`); start at the open template's first version
// (`defaultRevision`); draw its own preview (`renderPreview`) or lay the parts out in its own frame
// (`renderLayout`); start with the side panel expanded (`defaultPanelExpanded`); and remember the
// pane shown under its own key in the page's storage (`panelPersistKey`). An option read only when
// the workspace mounts mounts it again.

import { createSafeStorage, LockGlyph, UiProvider } from '@flamboyantengineer/ui-components/core';
import { EditorState } from 'prosemirror-state';
import { type ReactNode, useEffect,useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  DocumentEditor,
  TemplatePicker,
  type TemplatePreview,
  TemplateWorkspace,
  type TemplateWorkspaceParts,
} from '../../src/components/index.js';
import { assignElementIds, createContents, createDocumentEditing } from '../../src/engine/index.js';
import { type AssetAdapter, createMemoryHost, type TemplateSummary } from '../../src/host/index.js';
import {
  createDocumentSchema,
  readDocumentFile,
  type TemplateFile,
  templatePreviewDocument,
} from '../../src/model/index.js';
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

// The page's storage, where the side panel remembers the pane shown.
const STORAGE = createSafeStorage({
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key),
});

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

// The preview document of the template shown, with the editing that keeps the template's styles.
function hostPreviewState(read: () => TemplateFile) {
  const schema = createDocumentSchema();
  const state = EditorState.create({
    doc: readDocumentFile(templatePreviewDocument(read()), schema).doc,
    plugins: [
      createContents({ template: read }),
      ...createDocumentEditing(schema, { template: read, author: () => 'lab' }),
    ],
  });
  const tr = state.tr;
  assignElementIds(tr, {});
  return state.apply(tr.setMeta('addToHistory', false));
}

// The template the preview's plugins read, kept up with the one shown.
function useLatest(template: TemplateFile) {
  const latest = useRef(template);
  useLayoutEffect(() => {
    latest.current = template;
  }, [template]);
  return () => latest.current;
}

// The host's own preview (`renderPreview`): a document editor over the template's preview
// document, named for what the workspace hands it, whose headers and footers are edited in place
// while the template is editable.
function HostPreview({ preview }: { preview: TemplatePreview }) {
  const read = useLatest(preview.template);
  const [state, setState] = useState(() => hostPreviewState(read));
  const editable = preview.onRegionChange !== undefined;
  return (
    <section className="lab-host-preview" aria-label="Host preview">
      <p>
        Host preview of{' '}
        <output aria-label="Host preview shows">
          {[
            preview.template.name ?? preview.template.id,
            preview.layout,
            preview.scope ?? 'document',
            editable ? 'editable' : 'read only',
          ].join(', ')}
        </output>
      </p>
      <DocumentEditor
        fonts={LAB_FONTS}
        state={state}
        onStateChange={setState}
        template={preview.template}
        layout={preview.layout}
        editable={editable}
        onRegionChange={preview.onRegionChange}
        scrollable
        aria-label="Host preview document"
      />
    </section>
  );
}

// The host's own frame (`renderLayout`): the tabs and toolbar in its header, and below them, in
// the tabs' panel, the messages, the preview and a side column holding the properties and the
// history together.
function hostLayout(parts: TemplateWorkspaceParts): ReactNode {
  return (
    <div className="lab-host-layout" role="group" aria-label="Host layout">
      <div className="lab-host-layout__header">
        {parts.tabs}
        {parts.toolbar}
      </div>
      {parts.panel(
        <div className="lab-host-layout__body">
          {parts.messages}
          <div className="lab-host-layout__columns">
            <div className="lab-host-layout__preview">{parts.preview}</div>
            <aside className="lab-host-layout__side" aria-label="Host side column">
              <h2>Properties</h2>
              {parts.properties}
              <h2>History</h2>
              {parts.history}
            </aside>
          </div>
        </div>,
      )}
    </div>
  );
}

// The host options; those the workspace reads only when it mounts mount it again.
interface HostOptions {
  readonly route: boolean;
  readonly firstVersion: boolean;
  readonly ownPreview: boolean;
  readonly ownLayout: boolean;
  readonly panelExpanded: boolean;
  readonly paneKey: string;
}

const OPTIONS: HostOptions = {
  route: false,
  firstVersion: false,
  ownPreview: false,
  ownLayout: false,
  panelExpanded: false,
  paneKey: '',
};

// The host's route: the template open and the version shown.
interface Route {
  readonly id: string | null;
  readonly revision: string | null;
}

const routeText = ({ id, revision }: Route) =>
  id === null ? '/templates/new' : `/templates/${id}${revision ? `@${revision}` : ''}`;

function HostControls({
  options,
  onChange,
  route,
  onRoute,
  templates,
}: {
  options: HostOptions;
  onChange: (options: HostOptions) => void;
  route: Route;
  onRoute: (route: Route) => void;
  templates: readonly TemplateSummary[];
}) {
  const check = (key: keyof HostOptions, label: string) => (
    <label>
      <input
        type="checkbox"
        checked={options[key] === true}
        onChange={(event) => onChange({ ...options, [key]: event.currentTarget.checked })}
      />{' '}
      {label}
    </label>
  );
  return (
    <div className="lab-controls">
      <fieldset>
        <legend>Host options</legend>
        {check('route', 'Host holds the template and version')}{' '}
        {check('firstVersion', 'Start at the first version')}{' '}
        {check('ownPreview', 'Host draws the preview')}{' '}
        {check('ownLayout', 'Host lays the parts out')}{' '}
        {check('panelExpanded', 'Panel starts expanded')}{' '}
        <label>
          Remember the pane under{' '}
          <input
            value={options.paneKey}
            placeholder="de-template-workspace:pane"
            onChange={(event) => onChange({ ...options, paneKey: event.currentTarget.value })}
          />
        </label>
      </fieldset>
      <fieldset>
        <legend>Route</legend>
        <TemplatePicker
          label="Route template"
          placeholder="No template"
          templates={templates}
          selectedKey={route.id}
          onSelectionChange={(id) => onRoute({ id, revision: null })}
          isDisabled={!options.route}
        />{' '}
        <button
          type="button"
          disabled={!options.route || route.id === null}
          onClick={() => onRoute({ ...route, revision: 'rev-1' })}
        >
          Route to the first version
        </button>{' '}
        <button
          type="button"
          disabled={!options.route || route.revision === null}
          onClick={() => onRoute({ ...route, revision: null })}
        >
          Route to the template
        </button>{' '}
        <output aria-label="Route">{routeText(route)}</output>
      </fieldset>
    </div>
  );
}

function Lab() {
  const [openId, setOpenId] = useState<string | null>('report');
  const [options, setOptions] = useState<HostOptions>(OPTIONS);
  const [route, setRoute] = useState<Route>({ id: 'report', revision: null });
  const [templates, setTemplates] = useState<readonly TemplateSummary[]>([]);
  const [, setRead] = useState(0);
  const [stored, setStored] = useState<string | null>(null);
  const showStored = async () => {
    if (!openId) return;
    const loaded = await store.load(openId);
    setStored(loaded.ok ? JSON.stringify(loaded.value.template, null, 2) : null);
  };
  useEffect(() => {
    void readFolders().then(() => setRead((count) => count + 1));
    void store.list().then((listed) => {
      if (listed.ok) setTemplates(listed.value);
    });
  }, [openId]);
  const mount = [options.route, options.firstVersion, options.panelExpanded, options.paneKey].join(
    '\n',
  );
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
    <UiProvider storage={STORAGE}>
      <HostControls
        options={options}
        onChange={setOptions}
        route={route}
        onRoute={setRoute}
        templates={templates}
      />
      <p>
        <button type="button" onClick={() => void saveElsewhere()}>
          Save elsewhere
        </button>{' '}
        <button type="button" onClick={() => void showStored()}>
          Show the stored template
        </button>
      </p>
      <TemplateWorkspace
        key={mount}
        store={store}
        pageFonts={LAB_FONTS}
        {...(options.route
          ? { templateId: route.id, revision: route.revision }
          : {
              defaultTemplateId: 'report',
              defaultRevision: options.firstVersion ? 'rev-1' : undefined,
            })}
        onTemplateIdChange={(id) => {
          setOpenId(id);
          setRoute((now) => (now.id === id ? now : { id, revision: null }));
        }}
        onRevisionChange={(revision) => setRoute((now) => ({ ...now, revision }))}
        renderPreview={
          options.ownPreview
            ? (preview) => (
                <HostPreview
                  key={[
                    preview.template.id,
                    preview.scope ?? '',
                    preview.layout,
                    preview.onRegionChange ? 'edit' : 'view',
                  ].join('\n')}
                  preview={preview}
                />
              )
            : undefined
        }
        renderLayout={options.ownLayout ? hostLayout : undefined}
        defaultPanelExpanded={options.panelExpanded}
        panelPersistKey={options.paneKey || undefined}
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
    </UiProvider>
  );
}

const container = document.querySelector('#lab-editor');
if (container) {
  createRoot(container).render(<Lab />);
  markReadyWhenSettled();
}
