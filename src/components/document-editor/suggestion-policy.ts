// The editor's one policy for deciding suggestions, which the comments margin and the context menu
// share: a reader who edits may decide, and a writer who suggests may still withdraw their own.

import type { SuggestionPolicy } from '../../engine/index.js';
import type { DocumentEditorProps } from './document-editor.js';

/** The policy for deciding suggestions in an editor with these props. */
export function editorSuggestionPolicy(props: DocumentEditorProps): SuggestionPolicy {
  const { editable = true, suggesting = false, comments } = props;
  return {
    me: props.author ?? comments?.identity.currentPerson().id ?? null,
    canDecide: editable && !suggesting,
    canWithdraw: editable,
    decide: comments?.decide,
  };
}
