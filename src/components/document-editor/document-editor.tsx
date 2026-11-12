// A document editor: the document on pages or in the web layout, styled by its template, editable
// or read. The caller holds the editor state, as with every engine of the base library, so
// commands, toolbars and saving work on the same state the editor shows.

import type { CharacterGridCategory } from '@flamboyantengineer/ui-components/character-grid';
import type { AriaLabellingProps, BaseProps } from '@flamboyantengineer/ui-components/core';
import type {
  RichTextEngineEvents,
  RichTextNodeViewProps,
  RichTextStateUpdate,
} from '@flamboyantengineer/ui-components/rich-text-editor';
import { ScrollRegion } from '@flamboyantengineer/ui-components/scroll-region';
import type { EditorState, Transaction } from 'prosemirror-state';
import {
  type ComponentType,
  type CSSProperties,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  AssetAdapter,
  CodeSourceAdapter,
  FeedbackAdapter,
  GlossaryAdapter,
  ReferenceSourceAdapter,
  ScriptRunnerAdapter,
  TelemetryAdapter,
} from '../../host/index.js';
import { type TemplateFile, templateProperties } from '../../model/index.js';
import { createHooks } from '../../utils/hooks.js';
import type { DocumentCommentsOptions } from '../document-comments/document-comments.js';
import type { DocumentContextMenuOptions } from './context-providers.js';
import { EditorBody } from './editor-body.js';
import { BottomChrome, TopChrome, useWheelZoom } from './editor-chrome.js';
import { createEditorContext, DocumentEditorContext, type ObjectDialog } from './editor-context.js';
import { type DocumentEditorHandle, useEditorHandle } from './editor-handle.js';
import { DEFAULT_EDITOR_LABELS, type DocumentEditorLabels } from './editor-labels.js';
import type { DocumentMenubarOptions } from './menubar-menus.js';
import { ObjectDialogs } from './object-dialogs.js';
import type { DocumentToolbarOptions } from './toolbar-items.js';
import { useReviewNotifications } from './use-change-notifications.js';
import { useEngineView } from './use-editor-engine.js';
import { useEditorTelemetry } from './use-editor-telemetry.js';
import {
  type DocumentEditorNotifications,
  useElementIdRepair,
  useLayoutReady,
} from './use-host-events.js';

/** How suggestions show in the document. */
export type DocumentMarkup = 'all' | 'simple' | 'final' | 'original';
import {
  type DocumentComparison,
  type DocumentLayout,
  useDocumentLayout,
} from './use-document-layout.js';

/** What a document editor shows and how. */
export interface DocumentEditorProps
  extends BaseProps, AriaLabellingProps, DocumentEditorNotifications {
  /** Receives the editor's handle, for a host that drives it from outside. */
  handleRef?: Ref<DocumentEditorHandle> | undefined;
  /** The state shown, with the plugins the document runs (`createDocumentEditing` and others). */
  state: EditorState;
  /** Commits a state, or an update of the current one: pass a React state setter. */
  onStateChange: (update: RichTextStateUpdate) => void;
  /** The resolved template the document is shown in. */
  template: TemplateFile;
  /** On pages (the default), or as one page per section that fills the surface. */
  layout?: DocumentLayout | undefined;
  /** Whether the writer can edit; a read document keeps its state and selection. Defaults to true. */
  editable?: boolean | undefined;
  /** Whether an editable document takes changes as suggestions (`suggestTransaction`). */
  suggesting?: boolean | undefined;
  /** The writer suggestions are attributed to. */
  author?: string | null | undefined;
  /** Shows the document's changes from an older version (`createVersionChanges`). */
  compare?: DocumentComparison | null | undefined;
  /** Shows the document's comment threads and suggestions in a margin beside it. */
  comments?: DocumentCommentsOptions | undefined;
  /** React views by node type name, beside the views the plugins draw. */
  nodeViews?: Readonly<Record<string, ComponentType<RichTextNodeViewProps>>> | undefined;
  /** Notifications of the engine's commits. */
  events?: Omit<RichTextEngineEvents, 'props'> | undefined;
  /**
   * Shows the editor's toolbar above the document, with the host's items and controls when given
   * as options. Defaults to false.
   */
  toolbar?: boolean | DocumentToolbarOptions | undefined;
  /**
   * Shows a menubar above the toolbar: File, Edit, View, Insert, Format and Tools, shaped by the
   * host when given as options. Defaults to false.
   */
  menubar?: boolean | DocumentMenubarOptions | undefined;
  /**
   * Scrolls the document inside the editor, with overlay scrollbars, the toolbar staying above it;
   * the host gives the editor its height. Defaults to false.
   */
  scrollable?: boolean | undefined;
  /**
   * Shows the editor's status bar below the document: the page holding the caret, the words, and
   * whether the writer is editing, suggesting or reading. Defaults to false.
   */
  statusBar?: boolean | undefined;
  /** The host's own items at the end of the status bar. */
  statusItems?: ReactNode;
  /** Switches the layout: the status bar then offers a switch between pages and the web layout. */
  onLayoutChange?: ((layout: DocumentLayout) => void) | undefined;
  /** The document's zoom, in percent. Defaults to 100. */
  zoom?: number | undefined;
  /** Lets the reader zoom: a zoom control in the status bar, and Ctrl+wheel over the document. */
  onZoomChange?: ((zoom: number) => void) | undefined;
  /** The zoom levels the reader steps through, in percent, ascending. Defaults to `ZOOM_LEVELS`. */
  zoomLevels?: readonly number[] | undefined;
  /**
   * How suggestions show: all their markup (the default), `simple` (the document as if accepted,
   * with a bar beside each changed block), `final` (as if accepted) or `original` (as if rejected).
   */
  markup?: DocumentMarkup | undefined;
  /** The host's telemetry, which the editor reports its layout times to. */
  telemetry?: TelemetryAdapter | undefined;
  /** Shows the pages' layout for debugging: what each page's blocks take, and what is left. */
  debug?: boolean | undefined;
  /** Shows who wrote what: each writer's text in their colour slot (`data-author-slot`). */
  authorship?: boolean | undefined;
  /**
   * Repairs the element ids of each document the editor is given (`repairElementIds`), telling the
   * host through `onContentChange`. Defaults to false.
   */
  repairIds?: boolean | undefined;
  /** Opens a find bar above the document with Mod-F, to find and replace text. Defaults to false. */
  find?: boolean | undefined;
  /**
   * Whether the document opens the editor's context menu, with the host's providers and
   * arrangement when given as options. Defaults to true.
   */
  contextMenu?: boolean | DocumentContextMenuOptions | undefined;
  /**
   * Stores the figures the writer uploads, pastes or drops; without it a figure is inserted by
   * address.
   */
  assets?: AssetAdapter | undefined;
  /** Resolves the code linked code blocks show; without it the editor offers no linked code. */
  codeSource?: CodeSourceAdapter | undefined;
  /** Finds citations of other documents, which the reference dialog then offers. */
  referenceSource?: ReferenceSourceAdapter | undefined;
  /** The glossary abbreviations cite; without it the editor offers no abbreviations. */
  glossary?: GlossaryAdapter | undefined;
  /** Runs the script blocks: from their dialog and the context menu, and on opening for those that ask. */
  scriptRunner?: ScriptRunnerAdapter | undefined;
  /** Tells the reader what failed, such as an upload. */
  feedback?: FeedbackAdapter | undefined;
  /** The symbol picker's characters, in place of the editor's own. */
  symbols?: readonly CharacterGridCategory[] | undefined;
  /** The languages a code block's language menu offers, in place of the editor's own. */
  codeLanguages?: readonly string[] | undefined;
  /** The text of the editor's menus and table handles, beside the defaults. */
  labels?: Partial<DocumentEditorLabels> | undefined;
  /** Chrome inside the editor's engine, such as a toolbar reading its state. */
  children?: ReactNode;
  /**
   * Panels beside the document, between the toolbar and the status bar, such as a
   * `DocumentSidePanel` of the outline and search at the start and the properties at the end.
   */
  panels?: { readonly start?: ReactNode; readonly end?: ReactNode } | undefined;
}

const hooks = createHooks('document-editor', [
  'measure',
  'toolbar',
  'viewport',
  'workspace',
  'body',
  'content',
  'status-bar',
  'find',
]);

// The document between the panels beside it, when there are any.
function Workspace({
  panels,
  children,
}: {
  panels: DocumentEditorProps['panels'];
  children: ReactNode;
}) {
  if (!panels?.start && !panels?.end) return children;
  return (
    <div {...hooks.slot('workspace')}>
      {panels.start}
      {children}
      {panels.end}
    </div>
  );
}

// The editor root's hook values.
function rootData(props: DocumentEditorProps) {
  const { layout = 'page', editable = true, suggesting = false, compare } = props;
  return {
    markup: props.markup ?? 'all',
    layout,
    mode: editable ? 'authoring' : 'reading',
    suggesting: editable && suggesting,
    comparing: compare ? (compare.display ?? 'markup') : undefined,
    scrollable: props.scrollable ?? false,
    authorship: props.authorship ?? false,
    debug: props.debug ?? false,
  };
}

/**
 * Shows and edits a document. In page layout the pages follow every change; the template's values
 * are set on the editor as `--doc-*` properties for the stylesheet. Optionally the editor shows
 * its toolbar above the document and its status bar below it, and scrolls the document itself,
 * with overlay scrollbars.
 */
export function DocumentEditor(props: DocumentEditorProps) {
  const { state, template, layout = 'page', editable = true } = props;
  const { className, compare = null } = props;
  const measureIn = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  useWheelZoom(root, props);
  const measure = useEditorTelemetry(props.telemetry);
  const ready = useLayoutReady(props.onLayoutReady);
  const tap = useCallback(
    (tr: Transaction) => {
      measure(tr);
      ready.tap(tr);
    },
    [measure, ready],
  );
  const engine = useEngineView(props.events, props.onContentChange, tap);
  useEffect(() => {
    if (engine.view && layout === 'web') ready.signal();
  }, [engine.view, layout, ready]);
  useElementIdRepair(props.repairIds ? engine.view : null, state);
  const startCommentRef = useRef<(() => void) | null>(null);
  useEditorHandle(props.handleRef, engine.view, { startCommentRef, template });
  useReviewNotifications(engine.view, props);
  const labels = useMemo(() => ({ ...DEFAULT_EDITOR_LABELS, ...props.labels }), [props.labels]);
  useDocumentLayout(measureIn, { ...props, layout, compare });
  const templateStyle = useMemo(() => templateProperties(template), [template]);
  const [dialog, setDialog] = useState<ObjectDialog | null>(null);
  const context = useMemo(
    () => createEditorContext(engine.view, state, { editable, labels, openDialog: setDialog }),
    [engine.view, state, editable, labels],
  );
  const [finding, setFinding] = useState(false);
  const openFind = useMemo(() => (props.find ? () => setFinding(true) : null), [props.find]);
  const chrome = { props, context, view: engine.view, templateStyle, startCommentRef, openFind };
  const body = (
    <EditorBody
      props={props}
      engine={engine}
      labels={labels}
      startCommentRef={startCommentRef}
      onFind={openFind}
      onDialog={editable ? setDialog : null}
    />
  );
  return (
    <DocumentEditorContext value={context}>
      <div
        ref={root}
        {...hooks.root({ className, props, data: rootData(props) })}
        style={
          { ...templateStyle, '--de-zoom': String((props.zoom ?? 100) / 100) } as CSSProperties
        }
      >
        {layout === 'page' ? (
          <div {...hooks.slot('measure')} ref={measureIn} aria-hidden="true" spellCheck={false} />
        ) : null}
        <TopChrome {...chrome} finding={finding} onFindClose={() => setFinding(false)} />
        <Workspace panels={props.panels}>
          {props.scrollable ? (
            <ScrollRegion {...hooks.slot('viewport')} axis="both" scrollbar="overlay" tabIndex={-1}>
              {body}
            </ScrollRegion>
          ) : (
            body
          )}
        </Workspace>
        <BottomChrome {...chrome} openDialog={setDialog} />
        <ObjectDialogs
          {...props}
          dialog={editable ? dialog : null}
          view={engine.view}
          labels={labels}
          onClose={() => setDialog(null)}
        />
      </div>
    </DocumentEditorContext>
  );
}

// What another component reaches the editor by.
export { type EditorContext, useDocumentEditor } from './editor-context.js';
