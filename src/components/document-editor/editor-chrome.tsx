// The editor's chrome around the document: the toolbar and the find bar above it, the status bar
// and the context menu below it, and Ctrl+wheel or Cmd+wheel stepping the zoom.

import { findNextZoomLevel } from '@flamboyantengineer/ui-components/zoom-control';
import type { EditorView } from 'prosemirror-view';
import { type RefObject, useEffect, useMemo } from 'react';
import { customStyleNames } from '../../engine/index.js';
import { createHooks } from '../../utils/hooks.js';
import type { DocumentContextMenuOptions } from './context-providers.js';
import { DocumentContextMenu } from './document-context-menu.js';
import type { DocumentEditorProps } from './document-editor.js';
import { DocumentFindBar } from './document-find-bar.js';
import { DocumentMenubar } from './document-menubar.js';
import { DocumentStatusBar, type EditorZoom, ZOOM_LEVELS } from './document-status-bar.js';
import { DocumentToolbar } from './document-toolbar.js';
import type { EditorContext, ObjectDialog } from './editor-context.js';
import type { InsertFeatures } from './insert-controls.js';
import type { DocumentMenubarOptions } from './menubar-menus.js';
import { canDecideSuggestions } from './save-status-item.js';
import { DEFAULT_SYMBOLS } from './symbols.js';
import type { DocumentToolbarOptions } from './toolbar-items.js';

// The chrome's slots, in the editor's hooks.
const hooks = createHooks('document-editor', ['toolbar', 'find', 'status-bar']);

const NO_TOOLBAR_OPTIONS: DocumentToolbarOptions = {};
const NO_MENU_OPTIONS: DocumentContextMenuOptions = {};
const NO_MENUBAR_OPTIONS: DocumentMenubarOptions = {};

/** What the chrome reads. */
export interface ChromeProps {
  props: DocumentEditorProps;
  context: EditorContext;
  view: EditorView | null;
  templateStyle: Readonly<Record<string, string>>;
  startCommentRef: RefObject<(() => void) | null>;
  /** Opens the find bar, while the editor has one. */
  openFind?: (() => void) | null | undefined;
}

/** The toolbar and the find bar above the document. */
export function TopChrome({
  props,
  context,
  templateStyle,
  finding,
  onFindClose,
  view,
  openFind = null,
}: ChromeProps & {
  finding: boolean;
  onFindClose: () => void;
}) {
  const linkedCode = Boolean(props.codeSource);
  const glossary = Boolean(props.glossary);
  const scripts = Boolean(props.scriptRunner);
  const references = Boolean(props.referenceSource);
  const diagrams = Boolean(props.diagrams);
  const symbols = props.symbols ?? DEFAULT_SYMBOLS;
  const custom = customStyleNames(props.template).join('\n');
  const features = useMemo<InsertFeatures>(
    () => ({
      linkedCode,
      symbols,
      glossary,
      customStyles: custom ? custom.split('\n') : [],
      template: props.template,
      scripts,
      references,
      diagrams,
    }),
    [linkedCode, symbols, glossary, custom, props.template, scripts, references, diagrams],
  );
  return (
    <>
      {props.menubar ? (
        <DocumentMenubar
          context={context}
          templateStyle={templateStyle}
          features={features}
          options={props.menubar === true ? NO_MENUBAR_OPTIONS : props.menubar}
          menus={{
            view,
            openFind,
            layout: props.layout ?? 'page',
            onLayoutChange: props.onLayoutChange,
            zoom: editorZoom(props),
            scriptRunner: props.scriptRunner,
          }}
        />
      ) : null}
      {props.toolbar ? (
        <DocumentToolbar
          {...hooks.slot('toolbar')}
          context={context}
          options={props.toolbar === true ? NO_TOOLBAR_OPTIONS : props.toolbar}
          templateStyle={templateStyle}
          features={features}
        />
      ) : null}
      {props.find && finding ? (
        <DocumentFindBar {...hooks.slot('find')} context={context} onClose={onFindClose} />
      ) : null}
    </>
  );
}

/** The status bar below the document, and the context menu. */
export function BottomChrome({
  props,
  context,
  view,
  startCommentRef,
  openDialog,
}: ChromeProps & { openDialog: (dialog: ObjectDialog) => void }) {
  const { layout = 'page', editable = true, suggesting = false } = props;
  return (
    <>
      {props.statusBar ? (
        <DocumentStatusBar
          {...hooks.slot('status-bar')}
          view={view}
          state={context.state}
          labels={context.labels}
          layout={layout}
          mode={editable ? (suggesting ? 'suggesting' : 'editing') : 'reading'}
          items={props.statusItems}
          session={props.session}
          zoom={editorZoom(props)}
          onLayoutChange={props.onLayoutChange}
        />
      ) : null}
      {props.contextMenu === false ? null : (
        <DocumentContextMenu
          view={view}
          labels={context.labels}
          editable={editable}
          canDecide={canDecideSuggestions({
            editable,
            suggesting,
            capabilities: props.capabilities,
          })}
          startCommentRef={startCommentRef}
          openDialog={openDialog}
          linkedCode={Boolean(props.codeSource)}
          codeLanguages={props.codeLanguages}
          scriptRunner={props.scriptRunner}
          options={typeof props.contextMenu === 'object' ? props.contextMenu : NO_MENU_OPTIONS}
        />
      )}
    </>
  );
}

// The zoom the status bar and the menubar offer, while the reader can zoom.
function editorZoom(props: DocumentEditorProps): EditorZoom | null {
  const { onZoomChange: onChange } = props;
  if (!onChange) return null;
  return { value: props.zoom ?? 100, onChange, levels: props.zoomLevels ?? ZOOM_LEVELS };
}

/** Ctrl+wheel, or Cmd+wheel, over the editor steps the zoom through its levels, while the reader can zoom. */
export function useWheelZoom(
  root: RefObject<HTMLDivElement | null>,
  { zoom = 100, onZoomChange, zoomLevels = ZOOM_LEVELS }: DocumentEditorProps,
) {
  useEffect(() => {
    const element = root.current;
    if (!element || !onZoomChange) return undefined;
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.deltaY === 0) return;
      event.preventDefault();
      const next = findNextZoomLevel(zoomLevels, zoom, event.deltaY < 0 ? 1 : -1);
      if (next !== undefined) onZoomChange(next);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [root, zoom, onZoomChange, zoomLevels]);
}
