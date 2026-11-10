// The document editor lab's own context menu entries, as a host adds them: copying a link to the
// heading under the pointer, and naming the table cell there. And a lock, as a host's workflow
// sets one: the paragraph that starts with "Locked" cannot change.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { DocumentContextMenuOptions } from '../../src/components/index.js';

/** Locks the paragraphs that start with "Locked". */
export function isLockedParagraph(doc: ProseMirrorNode, pos: number): boolean {
  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.isTextblock) return node.textContent.startsWith('Locked');
  }
  return false;
}

/** The lab's context menu options. */
export const HOST_CONTEXT_MENU: DocumentContextMenuOptions = {
  providers: [
    {
      id: 'heading-link',
      placement: 'leading',
      entries: (target, context) => {
        const heading = target.node?.type.name === 'heading' ? target.elementId : null;
        if (!heading) return [];
        const clipboard = context.view?.dom.ownerDocument.defaultView?.navigator.clipboard;
        return [
          {
            id: 'copy-heading-link',
            label: 'Copy link to heading',
            isDisabled: !clipboard,
            onAction: () => {
              void clipboard?.writeText(`#${heading}`);
            },
          },
        ];
      },
    },
    {
      id: 'cell-name',
      placement: { after: 'table' },
      entries: (target) =>
        target.tableCell
          ? [
              {
                id: 'cell-name',
                label: `Row ${String(target.tableCell.row + 1)}, column ${String(target.tableCell.column + 1)}`,
                isDisabled: true,
              },
            ]
          : [],
    },
  ],
};
