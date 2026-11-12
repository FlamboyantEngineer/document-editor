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
import type { EditorState } from 'prosemirror-state';
import {
  type ComponentType,
  type CSSProperties,
  type ReactNode,
  type Ref,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { shortcutsOf } from '../../engine/index.js';
import type {
  AssetAdapter,
  CodeSourceAdapter,
  DiagramAdapter,
  EditorCapabilities,
  FeedbackAdapter,
  FontsAdapter,
  GlossaryAdapter,
  ReferenceSourceAdapter,
  ScriptRunnerAdapter,
  TelemetryAdapter,
  VariablesAdapter,
} from '../../host/index.js';
import {
  type FragmentRules,
  type LayoutRules,
  type TemplateFile,
  templateProperties,
} from '../../model/index.js';
import type { LayoutState, PageDebugParts } from '../../pagination/index.js';
import { createHooks } from '../../utils/hooks.js';
import type { DocumentCommentsOptions } from '../document-comments/document-comments.js';
import type { DocumentContextMenuOptions } from './context-providers.js';
import { EditorBody } from './editor-body.js';
import { BottomChrome, TopChrome, useWheelZoom } from './editor-chrome.js';
import {
  createEditorContext,
  DocumentEditorContext,
  type EditorContext,
  type ObjectDialog,
} from './editor-context.js';
import { type DocumentEditorHandle, useEditorHandle } from './editor-handle.js';
import { DEFAULT_EDITOR_LABELS, type DocumentEditorLabels } from './editor-labels.js';
import { EditorScope } from './editor-scope.js';
import type { DocumentMenubarOptions } from './menubar-menus.js';
import { ObjectDialogs } from './object-dialogs.js';
import { type EditorSession, useSaveShortcut } from './save-status-item.js';
import type { DocumentToolbarOptions } from './toolbar-items.js';
import { useReviewNotifications } from './use-change-notifications.js';
import { useDispatchBody, useEngineView } from './use-editor-engine.js';
import { useLayoutTap } from './use-editor-telemetry.js';
import { type DocumentEditorNotifications, useElementIdRepair } from './use-host-events.js';
import { usePagedEditor, usePagedView } from './use-paged-projection.js';

/** How suggestions show in the document. */
export type DocumentMarkup = 'all' | 'simple' | 'final' | 'original';

/** How the editor repairs the element ids of the documents it is given. */
export interface DocumentEditorIdRepair {
  /** The writer the repaired elements without one are attributed to, such as a system account. */
  readonly author?: string | undefined;
}

/** What the layout debugging shows. */
export interface DocumentEditorDebug extends PageDebugParts {
  /** The hidden view the pages are measured in, for a stylesheet to show beside them. */
  readonly measure?: boolean | undefined;
}
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
  /**
   * The document's session (`createDocumentSession`): the status bar shows where its changes stand,
   * with Retry after a failed save, and Mod-S saves it.
   */
  session?: EditorSession | undefined;
  /**
   * What the reader may do, as the session's live capabilities say: without `decide` the editor
   * offers no accept or reject. Defaults to every capability.
   */
  capabilities?: EditorCapabilities | undefined;
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
  /**
   * The host's font faces: the pages load the families the template names through it and stay
   * pending until they load, fail or time out (DOCE-PAGINATION-5.6).
   */
  fonts?: FontsAdapter | undefined;
  /**
   * The host's layout rules by node type, over the library's: how its blocks split and keep
   * together on pages. Read when the pages mount (DOCE-PAGINATION-1.7).
   */
  layoutRules?: LayoutRules | undefined;
  /** The host's fragment rules by node type, over `FRAGMENT_RULES`: how its fragments join. */
  fragmentRules?: FragmentRules | undefined;
  /**
   * Shows the pages' layout for debugging: `true` shows what each page's blocks take and what is
   * left; the parts name what else shows.
   */
  debug?: boolean | DocumentEditorDebug | undefined;
  /** Shows who wrote what: each writer's text in their colour slot (`data-author-slot`). */
  authorship?: boolean | undefined;
  /**
   * Repairs the element ids of each document the editor is given while it is editable
   * (`repairElementIds`), telling the host through `onContentChange`; `{ author }` attributes the
   * repaired elements without a writer to that author. Defaults to false.
   */
  repairIds?: boolean | DocumentEditorIdRepair | undefined;
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
  /**
   * Draws the diagrams figures show in the host's diagram editor; without it the editor offers no
   * diagrams.
   */
  diagrams?: DiagramAdapter | undefined;
  /** Resolves the code linked code blocks show; without it the editor offers no linked code. */
  codeSource?: CodeSourceAdapter | undefined;
  /** Finds citations of other documents, which the reference dialog then offers. */
  referenceSource?: ReferenceSourceAdapter | undefined;
  /** The glossary abbreviations cite; without it the editor offers no abbreviations. */
  glossary?: GlossaryAdapter | undefined;
  /** Runs the script blocks: from their dialog and the context menu, and on opening for those that ask. */
  scriptRunner?: ScriptRunnerAdapter | undefined;
  /**
   * The host's variables, such as `document.name`, shown in the headers, footers and text beside
   * the page numbers and today's date, again whenever the adapter says they changed.
   */
  variables?: VariablesAdapter | undefined;
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

// The parts of the layout debugging shown: `true` shows the pages'.
function debugParts(debug: DocumentEditorProps['debug']): DocumentEditorDebug {
  return typeof debug === 'object' ? debug : { pages: debug ?? false };
}

// The editor root's hook values.
function rootData(props: DocumentEditorProps, layoutState: LayoutState) {
  const { layout = 'page', editable = true, suggesting = false, compare } = props;
  const debug = debugParts(props.debug);
  return {
    markup: props.markup ?? 'all',
    layout,
    mode: editable ? 'authoring' : 'reading',
    suggesting: editable && suggesting,
    comparing: compare ? (compare.display ?? 'markup') : undefined,
    scrollable: props.scrollable ?? false,
    authorship: props.authorship ?? false,
    debug: debug.pages ?? false,
    debugBlocks: debug.blocks ?? false,
    debugMeasure: debug.measure ?? false,
    layoutState,
  };
}

// Where the pages are measured, and the editor's context, which the ghost's node views read too.
interface EditorLayoutRefs {
  readonly measureIn: RefObject<HTMLDivElement | null>;
  readonly context: RefObject<EditorContext | null>;
}

// The editor's layout, and the view its chrome acts on: the engine's, or, while the pages are a
// projection of the state, the engine's view as a view of the state.
function useEditorLayout(
  props: DocumentEditorProps,
  engine: ReturnType<typeof useEngineView>,
  { measureIn, context }: EditorLayoutRefs,
) {
  const { state, editable = true } = props;
  const paging = usePagedEditor({
    state,
    onStateChange: props.onStateChange,
    body: useDispatchBody(props, editable && (props.suggesting ?? false), props.author ?? null),
    events: engine.events,
  });
  const [layoutState, setLayoutState] = useState<LayoutState>('pending');
  const progress = useDocumentLayout(measureIn, {
    ...props,
    layout: props.layout ?? 'page',
    compare: props.compare ?? null,
    debug: debugParts(props.debug),
    onLayoutStateChange: setLayoutState,
    onCanonical: paging.onCanonical,
    onLayout: paging.onLayout,
    wrapGhost: (shown) => (
      <DocumentEditorContext value={context.current}>{shown}</DocumentEditorContext>
    ),
  });
  const view = usePagedView(progress.paged, engine.view, { state, targetRef: paging.targetRef });
  return { progress, view, layoutState };
}

/**
 * Shows and edits a document. In page layout the pages follow every change; the template's values
 * are set on the editor as `--doc-*` properties for the stylesheet. Optionally the editor shows
 * its toolbar above the document and its status bar below it, and scrolls the document itself,
 * with overlay scrollbars.
 */
export function DocumentEditor(props: DocumentEditorProps) {
  const { state, template, layout = 'page', editable = true } = props;
  const { className } = props;
  const measureIn = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  useWheelZoom(root, props);
  useSaveShortcut(root, { session: props.session, shortcuts: shortcutsOf(state) });
  const { tap, ready } = useLayoutTap(props.telemetry, props.onLayoutReady);
  const engine = useEngineView(props.events, props.onContentChange, tap);
  const editorContext = useRef<EditorContext | null>(null);
  const { progress, view, layoutState } = useEditorLayout(props, engine, {
    measureIn,
    context: editorContext,
  });
  useEffect(() => {
    if (view && layout === 'web') ready.signal();
  }, [view, layout, ready]);
  useElementIdRepair(editable ? view : null, state, props.repairIds);
  const startCommentRef = useRef<(() => void) | null>(null);
  useReviewNotifications(view, props);
  const labels = useMemo(() => ({ ...DEFAULT_EDITOR_LABELS, ...props.labels }), [props.labels]);
  useEditorHandle(props.handleRef, view, { startCommentRef, template, layout: progress });
  const templateStyle = useMemo(() => templateProperties(template), [template]);
  const [dialog, setDialog] = useState<ObjectDialog | null>(null);
  const context = useMemo(
    () => createEditorContext(view, state, { editable, labels, openDialog: setDialog }),
    [view, state, editable, labels],
  );
  useLayoutEffect(() => {
    editorContext.current = context;
  }, [context]);
  const [finding, setFinding] = useState(false);
  const openFind = useMemo(() => (props.find ? () => setFinding(true) : null), [props.find]);
  const chrome = { props, context, view, templateStyle, startCommentRef, openFind };
  const body = (
    <EditorBody
      props={props}
      engine={engine}
      view={view}
      paged={progress.paged}
      labels={labels}
      startCommentRef={startCommentRef}
      onFind={openFind}
      onDialog={editable ? setDialog : null}
    />
  );
  return (
    <EditorScope context={context} comments={props.comments} transactions={engine.transactions}>
      <div
        ref={root}
        {...hooks.root({ className, props, data: rootData(props, layoutState) })}
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
          view={view}
          labels={labels}
          onClose={() => setDialog(null)}
        />
      </div>
    </EditorScope>
  );
}

// What another component reaches the editor by.
export { type EditorContext, useDocumentEditor } from './editor-context.js';
