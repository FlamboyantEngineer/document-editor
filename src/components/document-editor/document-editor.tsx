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
import type { EditorState } from 'prosemirror-state';
import { type ComponentType, type CSSProperties, type ReactNode, useMemo, useRef } from 'react';
import { suggestTransaction } from '../../engine/index.js';
import { type TemplateFile, templateProperties } from '../../model/index.js';
import { createHooks } from '../../utils/hooks.js';
import {
  DocumentComments,
  type DocumentCommentsOptions,
} from '../document-comments/document-comments.js';
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
  /** Chrome inside the editor's engine, such as a toolbar reading its state. */
  children?: ReactNode;
}

const hooks = createHooks('document-editor', ['measure', 'content']);

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

/**
 * Shows and edits a document. In page layout the pages follow every change; the template's values
 * are set on the editor as `--doc-*` properties for the stylesheet.
 */
export function DocumentEditor(props: DocumentEditorProps) {
  const { state, onStateChange, template, layout = 'page', editable = true } = props;
  const { nodeViews, events, children, className, suggesting = false, author = null } = props;
  const { comments, compare = null } = props;
  const measureIn = useRef<HTMLDivElement>(null);
  useDocumentLayout(measureIn, { layout, template, state, onStateChange, compare });
  const style = useMemo(() => templateProperties(template) as CSSProperties, [template]);
  const viewProps = useMemo(() => ({ editable: () => editable }), [editable]);
  const dispatchTransaction = useSuggesting(editable && suggesting, author, events);
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
    <div
      {...hooks.root({
        className,
        props,
        data: {
          layout,
          mode: editable ? 'authoring' : 'reading',
          suggesting: editable && suggesting,
          comparing: compare ? (compare.display ?? 'markup') : undefined,
        },
      })}
      style={style}
    >
      {layout === 'page' ? (
        <div {...hooks.slot('measure')} ref={measureIn} aria-hidden="true" />
      ) : null}
      <RichTextEngineHost
        {...events}
        dispatchTransaction={dispatchTransaction}
        state={state}
        onStateChange={onStateChange}
        nodeViews={nodeViews}
        props={viewProps}
      >
        {comments ? (
          <DocumentComments
            {...comments}
            state={state}
            onStateChange={onStateChange}
            canDecide={editable && !suggesting}
          >
            {content}
          </DocumentComments>
        ) : (
          content
        )}
        {children}
      </RichTextEngineHost>
    </div>
  );
}
