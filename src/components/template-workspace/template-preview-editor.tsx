// The workspace's own preview of the tab shown, when the host draws none: the template's preview
// document shown in parts, a section's tab showing that section and then the sample in its
// settings, the document's tab the sample and then every section. Headers, footers and the
// sections' content and placeholders are edited in place and go into the draft; the sample, a
// section's own header or footer on the document's tab, and tables in a section are read-only. Its
// toolbar keeps what a template's own content takes, and its status bar the layout and the zoom.

import { EditorState } from 'prosemirror-state';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  assignElementIds,
  createContents,
  createDocumentEditing,
  templatePreviewLockOf,
} from '../../engine/index.js';
import type {
  AssetAdapter,
  FontsAdapter,
  ScriptRunnerAdapter,
  VariablesAdapter,
} from '../../host/index.js';
import {
  createDocumentSchema,
  readDocumentFile,
  type TemplateFile,
  templatePreviewDocument,
  templatePreviewPrevious,
  withEditableSections,
  writeDocumentFile,
} from '../../model/index.js';
import {
  DocumentEditor,
  type DocumentLayout,
  type DocumentStatusBarOptions,
  type DocumentToolbarOptions,
} from '../document-editor/document-editor.js';
import type { TemplatePreview } from './template-workspace-types.js';

// The toolbar's groups a template's own content keeps, each with the items it keeps.
const TOOLBAR_KEEPS: Readonly<Record<string, readonly string[]>> = {
  history: ['undo', 'redo'],
  'block-style': ['block-style'],
  marks: ['bold', 'italic', 'underline', 'strikethrough', 'code', 'superscript', 'subscript'],
  lists: ['bullet-list', 'numbered-list'],
  insert: ['insert-table', 'page-break', 'variable', 'script', 'symbol', 'image-asset'],
};

/**
 * The toolbar of a template's own content (`toolbar` of the document editor): undo and redo, the
 * text style, the formats, the bulleted and numbered lists, and a table, a page break, a variable,
 * a script, a symbol and an image of the host's; no references, footnotes, figures, code or math.
 */
export const TEMPLATE_PREVIEW_TOOLBAR: DocumentToolbarOptions = {
  arrange: (groups) =>
    groups.flatMap((group) => {
      const keeps = TOOLBAR_KEEPS[group.id];
      return keeps ? [{ ...group, items: group.items.filter(({ id }) => keeps.includes(id)) }] : [];
    }),
};

/** The status bar of a template's preview (`statusBar`): the layout switch and the zoom only. */
export const TEMPLATE_PREVIEW_STATUS_BAR: DocumentStatusBarOptions = {
  arrange: (items) => items.filter(({ id }) => id === 'layout' || id === 'zoom'),
};

/** The zoom levels of a template's preview, in percent. */
export const TEMPLATE_PREVIEW_ZOOM_LEVELS: readonly number[] = [50, 75, 100, 125, 150];

/** What the workspace's own preview draws with, besides the preview the workspace hands it. */
export interface TemplatePreviewEditorProps {
  readonly preview: TemplatePreview;
  /** The host's images, which the toolbar's image button places. */
  readonly assets?: AssetAdapter | undefined;
  /** The host's fonts the pages are laid out with (DOCE-HOST-1.14.1). */
  readonly fonts?: FontsAdapter | undefined;
  /** The host's variables, which the variable menu lists after the editor's own. */
  readonly variables?: VariablesAdapter | undefined;
  /** The host's script runner, which previews each template script beside it. */
  readonly scriptRunner?: ScriptRunnerAdapter | undefined;
  readonly 'aria-label'?: string | undefined;
}

// The preview document of a tab, with the editing that its lock allows, the lock following the
// template shown and the template as written.
function previewState(
  template: TemplateFile,
  scope: string | null,
  read: () => readonly [TemplateFile, TemplateFile | undefined],
) {
  const schema = createDocumentSchema();
  const file = templatePreviewDocument(template, undefined, { parts: true, scope });
  const editable = () => withEditableSections(read()[0]);
  const state = EditorState.create({
    doc: readDocumentFile(file, schema).doc,
    plugins: [
      createContents({ template: () => read()[0] }),
      ...createDocumentEditing(schema, {
        template: editable,
        author: () => 'template',
        isLocked: (doc, pos) => {
          const [shown, own] = read();
          return templatePreviewLockOf({ template: shown, scope, own })(doc, pos);
        },
      }),
    ],
  });
  const tr = state.tr;
  assignElementIds(tr, {});
  return state.apply(tr.setMeta('addToHistory', false));
}

// The template the preview's plugins read, kept up with the one shown, and the one as written.
function useLatestTemplate(template: TemplateFile, own: TemplateFile | undefined) {
  const latest = useRef([template, own] as const);
  useLayoutEffect(() => {
    latest.current = [template, own];
  }, [template, own]);
  return () => latest.current;
}

/**
 * The template's preview for the tab shown, edited in place. The workspace draws it again for
 * another template, tab or layout.
 */
export function TemplatePreviewEditor({
  preview,
  assets,
  fonts,
  variables,
  scriptRunner,
  ...rest
}: TemplatePreviewEditorProps) {
  const { template, scope } = preview;
  const read = useLatestTemplate(template, preview.own);
  const [state, setState] = useState(() => previewState(template, scope, read));
  // Compared with its older version, the sample shows a change of each kind with its change bar.
  const [compare] = useState(() => ({
    previous: readDocumentFile(templatePreviewPrevious(writeDocumentFile(state.doc)), state.schema)
      .doc,
  }));
  const [layout, setLayout] = useState<DocumentLayout>(preview.layout);
  const [zoom, setZoom] = useState(100);
  const editable = preview.onRegionChange !== undefined;
  // The same template while the one shown is, so the editor does not measure its pages again.
  const shown = useMemo(() => withEditableSections(template), [template]);
  return (
    <DocumentEditor
      state={state}
      onStateChange={setState}
      template={shown}
      layout={layout}
      onLayoutChange={setLayout}
      zoom={zoom}
      onZoomChange={setZoom}
      zoomLevels={TEMPLATE_PREVIEW_ZOOM_LEVELS}
      compare={compare}
      editable={editable}
      onRegionChange={preview.onRegionChange}
      onTemplatePartChange={preview.onTemplatePartChange}
      assets={assets}
      fonts={fonts}
      variables={variables}
      scriptRunner={scriptRunner}
      toolbar={editable ? TEMPLATE_PREVIEW_TOOLBAR : false}
      statusBar={TEMPLATE_PREVIEW_STATUS_BAR}
      scrollable
      aria-label={rest['aria-label']}
    />
  );
}
