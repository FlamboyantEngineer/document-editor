// The document editor lab's own toolbar items, as a host adds them: a button inserting today's
// date, the code format left out, and a saved state at the end of the toolbar.

import { undoDepth } from 'prosemirror-history';
import type { Command } from 'prosemirror-state';
import {
  type DocumentToolbarOptions,
  type ToolbarGroup,
  useDocumentEditor,
} from '../../src/components/index.js';

const insertDate: Command = (state, dispatch) => {
  if (dispatch)
    dispatch(state.tr.insertText(new Date().toISOString().slice(0, 10)).scrollIntoView());
  return true;
};

// Shows whether the writer has changed the document since it opened: the layout of its pages
// stays out of the history, so any undoable step is an edit.
function SavedState() {
  const editor = useDocumentEditor();
  const edited = editor ? undoDepth(editor.state) > 0 : false;
  return <span className="lab-saved-state">{edited ? 'Edited' : 'Saved'}</span>;
}

const withoutCode = (groups: readonly ToolbarGroup[]) =>
  groups.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.id !== 'code'),
  }));

/** The lab's toolbar options. */
export const HOST_TOOLBAR: DocumentToolbarOptions = {
  items: [
    {
      kind: 'button',
      id: 'insert-date',
      group: 'insert',
      label: 'Insert date',
      run: (context) => context.run(insertDate),
    },
  ],
  arrange: withoutCode,
  end: <SavedState />,
};
