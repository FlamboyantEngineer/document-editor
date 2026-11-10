// A document editor: the document on pages or in the web layout, styled by its template, editable
// or read. The caller holds the editor state, as with every engine of the base library, so
// commands, toolbars and saving work on the same state the editor shows.

import type { AriaLabellingProps, BaseProps } from '@flamboyantengineer/ui-components/core';
import {
  RichTextEngineContent,
  type RichTextEngineEvents,
  RichTextEngineHost,
  type RichTextNodeViewProps,
  type RichTextStateUpdate,
} from '@flamboyantengineer/ui-components/rich-text-editor';
import { ScrollRegion } from '@flamboyantengineer/ui-components/scroll-region';
import type { EditorState, Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import {
  type ComponentType,
  type CSSProperties,
  type ReactNode,
  type Ref,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { TelemetryAdapter } from '../../host/index.js';
import { type TemplateFile, templateProperties } from '../../model/index.js';
import { createHooks } from '../../utils/hooks.js';
import {
  DocumentComments,
  type DocumentCommentsOptions,
} from '../document-comments/document-comments.js';
import type { DocumentContextMenuOptions } from './context-providers.js';
import { BottomChrome, TopChrome, useWheelZoom } from './editor-chrome.js';
import { createEditorContext, DocumentEditorContext } from './editor-context.js';
import { type DocumentEditorHandle, useEditorHandle } from './editor-handle.js';
import { DEFAULT_EDITOR_LABELS, type DocumentEditorLabels } from './editor-labels.js';
import { TableHandles } from './table-handles.js';
import type { DocumentToolbarOptions } from './toolbar-items.js';
import {
  isFindKey,
  READ_SELECTION_FIRST,
  useDispatchBody,
  useEngineView,
} from './use-editor-engine.js';
import { useEditorTelemetry } from './use-editor-telemetry.js';
import {
  type DocumentEditorNotifications,
  useElementIdRepair,
  useHostViewProps,
  useLayoutReady,
  useSelectionNotification,
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
  /** The document's zoom, in percent. Defaults to 100. */
  zoom?: number | undefined;
  /** Lets the reader zoom: a zoom control in the status bar, and Ctrl+wheel over the document. */
  onZoomChange?: ((zoom: number) => void) | undefined;
  /**
   * How suggestions show: all their markup (the default), `simple` (the document as if accepted,
   * with a bar beside each changed block), `final` (as if accepted) or `original` (as if rejected).
   */
  markup?: DocumentMarkup | undefined;
  /** The host's telemetry, which the editor reports its layout times to. */
  telemetry?: TelemetryAdapter | undefined;
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
  /** The text of the editor's menus and table handles, beside the defaults. */
  labels?: Partial<DocumentEditorLabels> | undefined;
  /** Chrome inside the editor's engine, such as a toolbar reading its state. */
  children?: ReactNode;
}

const hooks = createHooks('document-editor', [
  'measure',
  'toolbar',
  'viewport',
  'body',
  'content',
  'status-bar',
  'find',
]);

interface EditorBodyProps {
  props: DocumentEditorProps;
  /** Opens the find bar, while the editor has one. */
  onFind: (() => void) | null;
  engine: ReturnType<typeof useEngineView>;
  labels: DocumentEditorLabels;
  startCommentRef: RefObject<(() => void) | null>;
}

// The document in its engine, with the comments margin, the caller's chrome and the table handles.
function EditorBody({ props, engine, labels, startCommentRef, onFind }: EditorBodyProps) {
  const { state, onStateChange, editable = true, suggesting = false, author = null } = props;
  const host = useHostViewProps(props);
  const viewProps = useMemo(
    () => ({
      editable: () => editable,
      // The host's proofer checks the text; the browser's own spelling check stays off.
      attributes: { spellcheck: 'false' },
      handleKeyDown: (view: EditorView, event: KeyboardEvent) => {
        if (host.handleKeyDown?.(view, event)) return true;
        if (!onFind || !isFindKey(event)) return false;
        event.preventDefault();
        onFind();
        return true;
      },
      handleDOMEvents: {
        ...READ_SELECTION_FIRST,
        ...(host.focus ? { focus: host.focus } : {}),
        ...(host.blur ? { blur: host.blur } : {}),
      },
    }),
    [editable, host, onFind],
  );
  const dispatchTransaction = useDispatchBody(props, editable && suggesting, author);
  const content = (
    <RichTextEngineContent
      {...hooks.slot('content')}
      role="textbox"
      aria-multiline="true"
      aria-readonly={editable ? undefined : 'true'}
      aria-label={props['aria-label']}
      aria-labelledby={props['aria-labelledby']}
    />
  );
  return (
    <div {...hooks.slot('body')}>
      <RichTextEngineHost
        {...engine.events}
        dispatchTransaction={dispatchTransaction}
        state={state}
        onStateChange={onStateChange}
        nodeViews={props.nodeViews}
        props={viewProps}
      >
        {props.comments ? (
          <DocumentComments
            {...props.comments}
            state={state}
            onStateChange={onStateChange}
            canDecide={editable && !suggesting}
            startRef={startCommentRef}
          >
            {content}
          </DocumentComments>
        ) : (
          content
        )}
        {props.children}
      </RichTextEngineHost>
      {editable && !suggesting ? (
        <TableHandles view={engine.view} state={state} labels={labels} />
      ) : null}
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
  };
}

/**
 * Shows and edits a document. In page layout the pages follow every change; the template's values
 * are set on the editor as `--doc-*` properties for the stylesheet. Optionally the editor shows
 * its toolbar above the document and its status bar below it, and scrolls the document itself,
 * with overlay scrollbars.
 */
export function DocumentEditor(props: DocumentEditorProps) {
  const { state, onStateChange, template, layout = 'page', editable = true } = props;
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
  useEditorHandle(props.handleRef, engine.view);
  useSelectionNotification(state, props.onSelectionChange);
  const startCommentRef = useRef<(() => void) | null>(null);
  const labels = useMemo(() => ({ ...DEFAULT_EDITOR_LABELS, ...props.labels }), [props.labels]);
  useDocumentLayout(measureIn, { layout, template, state, onStateChange, compare });
  const templateStyle = useMemo(() => templateProperties(template), [template]);
  const context = useMemo(
    () => createEditorContext(engine.view, state, { editable, labels }),
    [engine.view, state, editable, labels],
  );
  const [finding, setFinding] = useState(false);
  const openFind = useMemo(() => (props.find ? () => setFinding(true) : null), [props.find]);
  const chrome = { props, context, view: engine.view, templateStyle, startCommentRef };
  const body = (
    <EditorBody
      props={props}
      engine={engine}
      labels={labels}
      startCommentRef={startCommentRef}
      onFind={openFind}
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
        {props.scrollable ? (
          <ScrollRegion {...hooks.slot('viewport')} axis="both" scrollbar="overlay" tabIndex={-1}>
            {body}
          </ScrollRegion>
        ) : (
          body
        )}
        <BottomChrome {...chrome} />
      </div>
    </DocumentEditorContext>
  );
}
