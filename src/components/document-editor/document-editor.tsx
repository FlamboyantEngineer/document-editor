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
import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import {
  type ComponentType,
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useMemo,
  useRef,
  useState,
} from 'react';
import { suggestTransaction } from '../../engine/index.js';
import { type TemplateFile, templateProperties } from '../../model/index.js';
import { createHooks } from '../../utils/hooks.js';
import {
  DocumentComments,
  type DocumentCommentsOptions,
} from '../document-comments/document-comments.js';
import { DocumentContextMenu } from './document-context-menu.js';
import { DocumentStatusBar } from './document-status-bar.js';
import { DocumentToolbar } from './document-toolbar.js';
import { DEFAULT_EDITOR_LABELS, type DocumentEditorLabels } from './editor-labels.js';
import { TableHandles } from './table-handles.js';
import {
  type DocumentComparison,
  type DocumentLayout,
  useDocumentLayout,
} from './use-document-layout.js';

/** What a document editor shows and how. */
export interface DocumentEditorProps extends BaseProps, AriaLabellingProps {
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
  /** Shows the editor's toolbar above the document. Defaults to false. */
  toolbar?: boolean | undefined;
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
  /** Whether the document opens the editor's context menu. Defaults to true. */
  contextMenu?: boolean | undefined;
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
]);

type DispatchBody = NonNullable<RichTextEngineEvents['dispatchTransaction']>;

// The dispatch body: while suggesting, each local change is rewritten as a suggestion, and one a
// suggestion cannot record is dropped; the host's own body, if any, then decides what commits.
function useSuggesting(
  suggesting: boolean,
  author: string | null,
  events: DocumentEditorProps['events'],
): DispatchBody | undefined {
  const body = events?.dispatchTransaction;
  return useMemo(() => {
    if (!suggesting) return body;
    return (tr, view, commit) => {
      const next = suggestTransaction(tr, view.state, { author });
      if (!next) return;
      if (body) body(next, view, commit);
      else commit.applyDefault(next);
    };
  }, [suggesting, author, body]);
}

type EngineEvents = NonNullable<DocumentEditorProps['events']>;

// The caller's events, with the engine's view kept for the chrome that acts on it.
function useEngineView(events: DocumentEditorProps['events']) {
  const [view, setView] = useState<EditorView | null>(null);
  const withView = useMemo<EngineEvents>(
    () => ({
      ...events,
      onMounted: (mounted) => {
        setView(mounted);
        events?.onMounted?.(mounted);
      },
      onUnmounted: () => {
        setView(null);
        events?.onUnmounted?.();
      },
    }),
    [events],
  );
  return { view, events: withView };
}

interface EditorBodyProps {
  props: DocumentEditorProps;
  engine: ReturnType<typeof useEngineView>;
  labels: DocumentEditorLabels;
  startCommentRef: RefObject<(() => void) | null>;
}

// The document in its engine, with the comments margin, the caller's chrome and the table handles.
function EditorBody({ props, engine, labels, startCommentRef }: EditorBodyProps) {
  const { state, onStateChange, editable = true, suggesting = false, author = null } = props;
  const viewProps = useMemo(() => ({ editable: () => editable }), [editable]);
  const dispatchTransaction = useSuggesting(editable && suggesting, author, props.events);
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
  const { className, suggesting = false, compare = null } = props;
  const measureIn = useRef<HTMLDivElement>(null);
  const engine = useEngineView(props.events);
  const startCommentRef = useRef<(() => void) | null>(null);
  const labels = useMemo(() => ({ ...DEFAULT_EDITOR_LABELS, ...props.labels }), [props.labels]);
  useDocumentLayout(measureIn, { layout, template, state, onStateChange, compare });
  const templateStyle = useMemo(() => templateProperties(template), [template]);
  const style = templateStyle as CSSProperties;
  const body = (
    <EditorBody props={props} engine={engine} labels={labels} startCommentRef={startCommentRef} />
  );
  return (
    <div {...hooks.root({ className, props, data: rootData(props) })} style={style}>
      {layout === 'page' ? (
        <div {...hooks.slot('measure')} ref={measureIn} aria-hidden="true" />
      ) : null}
      {props.toolbar ? (
        <DocumentToolbar
          {...hooks.slot('toolbar')}
          view={engine.view}
          state={state}
          labels={labels}
          editable={editable}
          templateStyle={templateStyle}
        />
      ) : null}
      {props.scrollable ? (
        <ScrollRegion {...hooks.slot('viewport')} axis="both" scrollbar="overlay" tabIndex={-1}>
          {body}
        </ScrollRegion>
      ) : (
        body
      )}
      {props.statusBar ? (
        <DocumentStatusBar
          {...hooks.slot('status-bar')}
          state={state}
          labels={labels}
          layout={layout}
          mode={editable ? (suggesting ? 'suggesting' : 'editing') : 'reading'}
          items={props.statusItems}
        />
      ) : null}
      {props.contextMenu === false ? null : (
        <DocumentContextMenu
          view={engine.view}
          labels={labels}
          editable={editable}
          canDecide={editable && !suggesting}
          startCommentRef={startCommentRef}
        />
      )}
    </div>
  );
}
