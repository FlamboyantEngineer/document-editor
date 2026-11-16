// The context menu's entries for a list of contents: a table of contents' depth, and the groups a
// grouped list, such as a list of references, shows.

import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { contentsGroupsAt, setContentsDepth, setContentsGroups } from '../../engine/index.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import { commandEntry } from './table-actions.js';

// The groups a grouped list shows, each a check item that shows or hides it.
function groupEntries(view: EditorView, pos: number, labels: DocumentEditorLabels): MenuEntry[] {
  const groups = contentsGroupsAt(view.state, pos);
  if (groups.length === 0) return [];
  const every = groups.map(({ group }) => group);
  const shown = groups.filter((each) => each.shown).map(({ group }) => group);
  return [
    {
      id: 'contents-groups',
      label: labels.contentsGroups,
      items: groups.map(({ group, title, shown: isShown }) => ({
        ...commandEntry(
          view,
          { id: `group-${group}`, label: title },
          setContentsGroups(
            isShown ? shown.filter((each) => each !== group) : [...shown, group],
            every,
          ),
        ),
        isSelected: isShown,
      })),
    },
  ];
}

/** The entries for the list of contents at the selection, if any. */
export function contentsEntries(
  view: EditorView,
  contents: { node: ProseMirrorNode; pos: number } | null,
  labels: DocumentEditorLabels,
): MenuEntry[] {
  if (!contents) return [];
  if (contents.node.attrs.tocType !== 'toc') return groupEntries(view, contents.pos, labels);
  const depth = Number(contents.node.attrs.minLevel);
  return [
    {
      id: 'contents-depth',
      label: labels.contentsDepth,
      items: [1, 2, 3, 4, 5, 6].map((level) => ({
        ...commandEntry(
          view,
          { id: `depth-${String(level)}`, label: labels.depthLevel(level) },
          setContentsDepth(level),
        ),
        isSelected: level === depth,
      })),
    },
  ];
}
