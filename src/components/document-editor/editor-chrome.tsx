// The editor's chrome around the document: the toolbar and the find bar above it, the status bar
// and the context menu below it, and Ctrl+wheel or Cmd+wheel stepping the zoom.

import { findNextZoomLevel } from '@flamboyantengineer/ui-components/zoom-control';
import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { memo, type RefObject, useDeferredValue, useEffect, useMemo } from 'react';
import { customStyleNames } from '../../engine/index.js';
import { createHooks } from '../../utils/hooks.js';
import type { DocumentContextMenuOptions } from './context-providers.js';
import { DocumentContextMenu } from './document-context-menu.js';
import type { DocumentEditorProps } from './document-editor.js';
import { DocumentFindBar, type FindBarMode, type FindRequest } from './document-find-bar.js';
import { DocumentMenubar } from './document-menubar.js';
import {
  DocumentStatusBar,
  type DocumentStatusBarOptions,
  type EditorZoom,
  ZOOM_LEVELS,
} from './document-status-bar.js';
import { DocumentToolbar } from './document-toolbar.js';
import {
  contextOptionsOf,
  DocumentEditorContext,
  type EditorContext,
  type ObjectDialog,
} from './editor-context.js';
import { figurePasteOptions } from './figure-paste.js';
import type { InsertFeatures } from './insert-controls.js';
import type { DocumentMenubarOptions } from './menubar-menus.js';
import type { ShellFeatures } from './mode-controls.js';
import { editorSuggestionPolicy } from './suggestion-policy.js';
import { DEFAULT_SYMBOLS } from './symbols.js';
import type { DocumentToolbarOptions } from './toolbar-items.js';
import type { DocumentExports } from './use-document-exports.js';

// The chrome's slots, in the editor's hooks.
const hooks = createHooks('document-editor', ['toolbar', 'find', 'status-bar']);

const NO_TOOLBAR_OPTIONS: DocumentToolbarOptions = {};
const NO_MENU_OPTIONS: DocumentContextMenuOptions = {};
const NO_MENUBAR_OPTIONS: DocumentMenubarOptions = {};
const NO_STATUS_BAR_OPTIONS: DocumentStatusBarOptions = {};

/** What the chrome reads. */
export interface ChromeProps {
  props: DocumentEditorProps;
  context: EditorContext;
  view: EditorView | null;
  templateStyle: Readonly<Record<string, string>>;
  startCommentRef: RefObject<(() => void) | null>;
  /** Opens the find bar at a box, while the editor has one. */
  openFind?: ((mode?: FindBarMode) => void) | null | undefined;
  /**
   * The pages' state while they are a projection of the editor's state, so the chrome follows each
   * layout as well as each state, such as the status bar's page count.
   */
  pages?: EditorState | null | undefined;
  /** The host's exports, for File > Export. */
  exports?: DocumentExports | undefined;
}

/** What the chrome above the document reads. */
export type TopChromeProps = ChromeProps & {
  findRequest: FindRequest | null;
  onFindClose: () => void;
};

/** What the chrome below the document reads. */
export type BottomChromeProps = ChromeProps & { openDialog: (dialog: ObjectDialog) => void };

/**
 * The chrome above the document as it follows the editor: it takes the editor's values deferred
 * (`useDeferredValue`), so it draws each state in a render of its own after the one that draws the
 * document, which React may interrupt, and only it draws again in that render; its controls read
 * the editor's context as it draws them (DOCE-EDITOR-1.7).
 */
export function FollowingTopChrome(chrome: TopChromeProps) {
  return <ShownTopChrome chrome={useDeferredValue(chrome)} />;
}

/** The chrome below the document as it follows the editor, as `FollowingTopChrome`. */
export function FollowingBottomChrome(chrome: BottomChromeProps) {
  return <ShownBottomChrome chrome={useDeferredValue(chrome)} />;
}

// The chrome as the deferred values show it: the urgent render leaves it as it was.
const ShownTopChrome = memo(function ShownTopChrome({ chrome }: { chrome: TopChromeProps }) {
  return (
    <DocumentEditorContext value={chrome.context}>
      <TopChrome {...chrome} />
    </DocumentEditorContext>
  );
});

const ShownBottomChrome = memo(function ShownBottomChrome({
  chrome,
}: {
  chrome: BottomChromeProps;
}) {
  return (
    <DocumentEditorContext value={chrome.context}>
      <BottomChrome {...chrome} />
    </DocumentEditorContext>
  );
});

// What the insert items offer, kept while the host's features stay the same.
function useInsertFeatures(props: TopChromeProps['props']): InsertFeatures {
  const linkedCode = Boolean(props.codeSource);
  const glossary = Boolean(props.glossary);
  const scripts = Boolean(props.scriptRunner);
  const references = Boolean(props.referenceSource);
  const diagrams = Boolean(props.diagrams);
  const symbols = props.symbols ?? DEFAULT_SYMBOLS;
  const custom = customStyleNames(props.template).join('\n');
  const { variables } = props;
  const templateContent = Boolean(props.onRegionChange);
  return useMemo<InsertFeatures>(
    () => ({
      linkedCode,
      symbols,
      glossary,
      customStyles: custom ? custom.split('\n') : [],
      template: props.template,
      scripts,
      references,
      diagrams,
      variables,
      templateContent,
    }),
    [
      linkedCode,
      symbols,
      glossary,
      custom,
      props.template,
      scripts,
      references,
      diagrams,
      variables,
      templateContent,
    ],
  );
}

/** The toolbar and the find bar above the document. */
function TopChrome({
  props,
  context,
  templateStyle,
  findRequest,
  onFindClose,
  view,
  openFind = null,
  exports,
}: TopChromeProps) {
  const features = useInsertFeatures(props);
  const { onModeChange, modeReasons, onMarkupChange } = props;
  const shell = useMemo<ShellFeatures>(
    () => ({ onModeChange, modeReasons, onMarkupChange }),
    [onModeChange, modeReasons, onMarkupChange],
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
            openFind: openFind ? () => openFind('find') : null,
            layout: props.layout ?? 'page',
            onLayoutChange: props.onLayoutChange,
            zoom: editorZoom(props),
            scriptRunner: props.scriptRunner,
            glossary: props.glossary,
            template: props.template,
            shell,
            exports,
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
          shell={shell}
        />
      ) : null}
      {props.find && findRequest ? (
        <DocumentFindBar
          {...hooks.slot('find')}
          context={context}
          request={findRequest}
          onClose={onFindClose}
        />
      ) : null}
    </>
  );
}

/** The status bar below the document. */
function BottomChrome({ props, context, pages }: BottomChromeProps) {
  const { layout = 'page' } = props;
  const zoom = useEditorZoom(props);
  return (
    <>
      {props.statusBar ? (
        <DocumentStatusBar
          {...hooks.slot('status-bar')}
          labels={context.labels}
          layout={layout}
          options={props.statusBar === true ? NO_STATUS_BAR_OPTIONS : props.statusBar}
          session={props.session}
          zoom={zoom}
          onLayoutChange={props.onLayoutChange}
          pages={pages}
        />
      ) : null}
    </>
  );
}

/**
 * The editor's context menu, on the editor's latest props rather than after them as the rest of the
 * chrome: it acts on the input that opens it (DOCE-EDITOR-1.7).
 */
export function EditorContextMenu({
  props,
  context,
  view,
  startCommentRef,
  openDialog,
}: BottomChromeProps) {
  const { editable = true } = props;
  if (props.contextMenu === false) return null;
  return (
    <DocumentContextMenu
      view={view}
      labels={context.labels}
      editable={editable}
      suggestionPolicy={editorSuggestionPolicy(props)}
      startCommentRef={startCommentRef}
      openDialog={openDialog}
      linkedCode={Boolean(props.codeSource)}
      codeLanguages={props.codeLanguages}
      scriptRunner={props.scriptRunner}
      suggesting={editable && (props.suggesting ?? false)}
      images={figurePasteOptions(props, context.labels)}
      options={typeof props.contextMenu === 'object' ? props.contextMenu : NO_MENU_OPTIONS}
      shown={contextOptionsOf(props, { labels: context.labels, openDialog })}
    />
  );
}

// The zoom the status bar and the menubar offer, while the reader can zoom.
function editorZoom({
  zoom = 100,
  onZoomChange: onChange,
  zoomLevels = ZOOM_LEVELS,
}: Pick<DocumentEditorProps, 'zoom' | 'onZoomChange' | 'zoomLevels'>): EditorZoom | null {
  if (!onChange) return null;
  return { value: zoom, onChange, levels: zoomLevels };
}

// The zoom as `editorZoom`, the same while its values are.
function useEditorZoom({ zoom, onZoomChange, zoomLevels }: DocumentEditorProps) {
  return useMemo(
    () => editorZoom({ zoom, onZoomChange, zoomLevels }),
    [zoom, onZoomChange, zoomLevels],
  );
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
