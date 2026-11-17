// The text styles a document offers: the paragraph, the title, the headings and the template's
// custom styles, each with the command that sets it, and the style of the block holding the selection.

import type { Node as ProseMirrorNode, NodeType, Schema } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import {
  setCustomStyle,
  setTextblockType,
  type ShortcutId,
  shortcutLabel,
  type ShortcutTable,
} from '../../engine/index.js';
import type { DocumentEditorLabels } from './editor-labels.js';

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;

/**
 * The text style of the block holding the selection, or the one every block it covers shares:
 * `paragraph`, `title` or `heading-<level>`; null for mixed or other blocks.
 */
export function blockStyle(state: EditorState): string | null {
  const { $from, $to, from, to } = state.selection;
  if ($from.sameParent($to)) return styleOf($from.parent);
  // Across blocks, the style they all share.
  const styles = new Set<string | null>();
  state.doc.nodesBetween(from, to, (node) => {
    if (!node.isTextblock) return true;
    styles.add(styleOf(node));
    return false;
  });
  const [only] = styles;
  return styles.size === 1 ? (only ?? null) : null;
}

// A text block's style: the paragraph, the title or a heading level; none for any other block.
function styleOf({ type, attrs }: ProseMirrorNode): string | null {
  if (type.name === 'paragraph') return 'paragraph';
  if (type.name !== 'heading') return null;
  return attrs.docTitle === true ? 'title' : `heading-${String(attrs.level)}`;
}

// The title: a first-level heading marked as the document's title.
const title = (heading: NodeType) => setTextblockType(heading, { level: 1, docTitle: true });

/** The text styles the schema has, and the template's custom ones, each with the command that sets it. */
export function blockStyles(
  schema: Schema,
  labels: DocumentEditorLabels,
  {
    shortcuts,
    customStyles,
  }: { readonly shortcuts: ShortcutTable; readonly customStyles: readonly string[] },
) {
  const { paragraph, heading } = schema.nodes;
  // A built-in style sets the block's attributes afresh, taking it out of any custom style.
  return [
    ...(paragraph
      ? [
          {
            id: 'paragraph',
            label: labels.paragraph,
            shortcut: shortcutLabel(shortcuts, 'paragraph'),
            command: setTextblockType(paragraph),
          },
        ]
      : []),
    ...(heading
      ? [
          { id: 'title', label: labels.titleStyle, shortcut: undefined, command: title(heading) },
          ...HEADING_LEVELS.map((level) => ({
            id: `heading-${String(level)}`,
            label: labels.heading(level),
            shortcut: shortcutLabel(shortcuts, `heading-${String(level)}` as ShortcutId),
            command: setTextblockType(heading, { level }),
          })),
        ]
      : []),
    ...customStyles.map((name) => ({
      id: `custom:${name}`,
      label: name,
      shortcut: undefined,
      command: setCustomStyle(name),
    })),
  ];
}
