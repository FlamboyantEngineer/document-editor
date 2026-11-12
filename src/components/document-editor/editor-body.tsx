// The editor's body: the document in its engine, with its view props (the host's keys, the
// editor's own keys, pasted figures), the comments margin around it, the caller's chrome inside
// the engine, and the table handles.

import {
  RichTextEngineContent,
  RichTextEngineHost,
} from '@flamboyantengineer/ui-components/rich-text-editor';
import type { EditorView } from 'prosemirror-view';
import { type RefObject, useMemo } from 'react';
import { createHooks } from '../../utils/hooks.js';
import { DocumentComments } from '../document-comments/document-comments.js';
import type { DocumentEditorProps } from './document-editor.js';
import type { ObjectDialog } from './editor-context.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import { figurePasteHandlers } from './figure-paste.js';
import { ObjectEditors } from './object-editors.js';
import { useOpeningScripts } from './script-entries.js';
import { TableHandles } from './table-handles.js';
import {
  isCommentKey,
  isFindKey,
  isReferenceKey,
  READ_SELECTION_FIRST,
  SelectionFirst,
  useDispatchBody,
  type useEngineView,
} from './use-editor-engine.js';
import { useHostViewProps } from './use-host-events.js';
import {
  canonicalViewProps,
  type PagedEditor,
  projectionDispatch,
  useProjectionEvents,
} from './use-paged-projection.js';

// The body's slots, in the editor's hooks.
const hooks = createHooks('document-editor', ['body', 'content']);

/** What the editor body reads. */
export interface EditorBodyProps {
  props: DocumentEditorProps;
  /** Opens the find bar, while the editor has one. */
  onFind: (() => void) | null;
  /** Opens one of the editor's dialogs, while the writer can edit. */
  onDialog: ((dialog: ObjectDialog) => void) | null;
  engine: ReturnType<typeof useEngineView>;
  /** The view the chrome acts on: the engine's, or its canonical view over a projection. */
  view: EditorView | null;
  /** The projection the engine renders in page layout, when the pages are one. */
  paged: PagedEditor | null;
  labels: DocumentEditorLabels;
  startCommentRef: RefObject<(() => void) | null>;
}

// The body's view props: pasted figures, the host's keys before the editor's own (comment,
// reference, find), secondary clicks left to the context menu, and the events that read the DOM
// selection first.
function useBodyViewProps({
  props,
  labels,
  startCommentRef,
  onFind,
  onDialog,
}: Omit<EditorBodyProps, 'engine' | 'view' | 'paged'>) {
  const { editable = true, assets, feedback } = props;
  const host = useHostViewProps(props);
  return useMemo(
    () => ({
      ...(assets
        ? figurePasteHandlers({
            assets,
            feedback,
            failure: labels.uploadFailed,
            uploading: labels.uploading,
          })
        : {}),
      editable: () => editable,
      // The host's proofer checks the text; the browser's own spelling check stays off.
      attributes: { spellcheck: 'false' },
      handleKeyDown: (view: EditorView, event: KeyboardEvent) => {
        if (host.handleKeyDown?.(view, event)) return true;
        const startComment = startCommentRef.current;
        if (startComment && isCommentKey(event)) {
          event.preventDefault();
          startComment();
          return true;
        }
        if (onDialog && isReferenceKey(event)) {
          event.preventDefault();
          onDialog({ kind: 'reference' });
          return true;
        }
        if (!onFind || !isFindKey(event)) return false;
        event.preventDefault();
        onFind();
        return true;
      },
      // A secondary click belongs to the context menu, which selects what it opens on: left to the
      // engine, its release would select the clicked object again and take focus from the menu.
      handleClick: (_view: EditorView, _pos: number, event: MouseEvent) => event.button === 2,
      handleDOMEvents: {
        ...READ_SELECTION_FIRST,
        ...(host.focus ? { focus: host.focus } : {}),
        ...(host.blur ? { blur: host.blur } : {}),
      },
    }),
    [editable, host, onFind, onDialog, assets, feedback, labels, startCommentRef],
  );
}

// The projection takes each of its states itself (`projectionDispatch`), so a commit the engine
// makes has nothing more to do.
const keepProjection = () => undefined;

// What the engine renders and how it commits: the host's state through the editor's dispatch body,
// or, while the pages are a projection, the projection's state, every transaction going to it.
function useEngineProps(
  props: DocumentEditorProps,
  {
    engine,
    paged,
    viewProps,
  }: {
    engine: EditorBodyProps['engine'];
    paged: PagedEditor | null;
    viewProps: ReturnType<typeof useBodyViewProps>;
  },
) {
  const { editable = true, suggesting = false, author = null } = props;
  const dispatchBody = useDispatchBody(props, editable && suggesting, author);
  const projection = paged?.projection ?? null;
  const events = useProjectionEvents(projection, engine.events);
  const shownProps = useMemo(
    () => canonicalViewProps(viewProps, projection),
    [viewProps, projection],
  );
  const dispatchTransaction = useMemo(
    () => (projection ? projectionDispatch(projection) : dispatchBody),
    [projection, dispatchBody],
  );
  return {
    ...events,
    dispatchTransaction,
    state: paged ? paged.state : props.state,
    onStateChange: paged ? keepProjection : props.onStateChange,
    props: shownProps,
  };
}

/** The document in its engine, with the comments margin, the caller's chrome and the table handles. */
export function EditorBody({
  props,
  engine,
  view,
  paged,
  labels,
  startCommentRef,
  onFind,
  onDialog,
}: EditorBodyProps) {
  const { state, onStateChange, editable = true, suggesting = false } = props;
  const viewProps = useBodyViewProps({ props, labels, startCommentRef, onFind, onDialog });
  const engineProps = useEngineProps(props, { engine, paged, viewProps });
  useOpeningScripts(view, props.scriptRunner);
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
      <SelectionFirst view={engine.view} state={engineProps.state} />
      <RichTextEngineHost {...engineProps} nodeViews={props.nodeViews}>
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
      {editable && !suggesting ? <TableHandles view={view} state={state} labels={labels} /> : null}
      {editable ? <ObjectEditors view={view} state={state} labels={labels} /> : null}
    </div>
  );
}
